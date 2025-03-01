from fastapi import FastAPI, Depends, HTTPException, Header, File, UploadFile, APIRouter, status, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from . import models, schemas, database, auth
from typing import List, Optional, Dict
from .database import engine, SessionLocal, get_db
from jose import jwt, JWTError
from .config import SECRET_KEY, ALGORITHM, ALLOWED_DOMAIN
from datetime import datetime, timedelta
from .models import RequestStatus, ServiceStatus, Service, ServiceAccess
from pydantic import BaseModel
from sqlalchemy import update, and_, delete, func
from .models import user_services  # user_services 테이블 import
import json
import socket
import os
import httpx
import asyncio
import subprocess
from .auth import update_nginx_config  # auth.py의 함수 import
import uuid
import secrets
import random
import math

services_router = APIRouter(prefix="/services")

# 서비스 상태 캐시 (메모리에 임시 저장)
service_status_cache: Dict[str, Dict] = {}


async def check_service_health(service: Service, max_retries: int = 3) -> Dict:
    """서비스 상태를 체크하고 결과를 반환합니다."""
    async with httpx.AsyncClient() as client:
        for attempt in range(max_retries):
            try:
                start_time = datetime.now()
                response = await client.get(f"http://{service.ip}:{service.port}/health", timeout=5.0)
                response_time = (datetime.now() - start_time).total_seconds() * 1000

                status = {
                    "isActive": response.status_code == 200,
                    "lastChecked": datetime.now().isoformat(),
                    "responseTime": round(response_time, 2),
                    "statusCode": response.status_code,
                    "retryCount": attempt,
                }

                if response.status_code == 200:
                    status["details"] = "정상"
                else:
                    status["details"] = f"HTTP 오류: {response.status_code}"

                return status

            except httpx.TimeoutException:
                if attempt == max_retries - 1:
                    return {
                        "isActive": False,
                        "lastChecked": datetime.now().isoformat(),
                        "error": "시간 초과",
                        "details": "서비스 응답 시간 초과",
                        "retryCount": attempt,
                    }
            except httpx.ConnectError:
                if attempt == max_retries - 1:
                    return {
                        "isActive": False,
                        "lastChecked": datetime.now().isoformat(),
                        "error": "연결 실패",
                        "details": "서비스에 연결할 수 없습니다",
                        "retryCount": attempt,
                    }
            except Exception as e:
                if attempt == max_retries - 1:
                    return {
                        "isActive": False,
                        "lastChecked": datetime.now().isoformat(),
                        "error": str(e),
                        "details": "알 수 없는 오류가 발생했습니다",
                        "retryCount": attempt,
                    }

            # 재시도 전 잠시 대기
            await asyncio.sleep(1)


async def update_service_status_history(db: Session, service_id: str, status: Dict):
    """서비스 상태 이력을 데이터베이스에 저장합니다."""
    new_status = ServiceStatus(
        service_id=service_id,
        is_active=status["isActive"],
        check_time=datetime.fromisoformat(status["lastChecked"]),
        response_time=status.get("responseTime"),
        error_message=status.get("error"),
        details=status.get("details"),
        retry_count=status.get("retryCount", 0),
    )
    db.add(new_status)
    await db.commit()
    return new_status


# get_service_by_id 함수 추가
async def get_service_by_id(service_id: str, db: Session = Depends(get_db)) -> Service:
    """서비스 ID로 서비스를 조회합니다."""
    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다")
    return service


@services_router.get("/{service_id}/status")
async def get_service_status(
    service_id: str,
    force_check: bool = False,
    db: Session = Depends(get_db),
):
    """서비스의 현재 상태를 반환합니다."""
    try:
        # 서비스 정보 조회
        service = await get_service_by_id(service_id, db)

        # 캐시된 상태 확인 (1분 이내)
        cached_status = service_status_cache.get(service_id)
        if not force_check and cached_status:
            last_checked = datetime.fromisoformat(cached_status["lastChecked"])
            if datetime.now() - last_checked < timedelta(minutes=1):
                return cached_status

        # 서비스 상태 체크
        status = await check_service_health(service)

        # 상태 이력 저장
        await update_service_status_history(db, service_id, status)

        # 캐시 업데이트
        service_status_cache[service_id] = status

        return status

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@services_router.get("/{service_id}/status/history")
async def get_service_status_history(service_id: str, limit: int = 10, db: Session = Depends(get_db)):
    """서비스의 상태 이력을 반환합니다."""
    try:
        history = (
            db.query(ServiceStatus)
            .filter(ServiceStatus.service_id == service_id)
            .order_by(ServiceStatus.check_time.desc())
            .limit(limit)
            .all()
        )

        return [
            {
                "checkTime": status.check_time.isoformat(),
                "isActive": status.is_active,
                "responseTime": status.response_time,
                "error": status.error_message,
                "details": status.details,
                "retryCount": status.retry_count,
            }
            for status in history
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 서비스에 사용자 추가를 위한 요청 모델
class ServiceUserAdd(BaseModel):
    emails: str = ""  # 쉼표로 구분된 이메일 목록 (비어 있을 수 있음)
    showInfo: bool = False  # IP:PORT 정보 공개 여부

    class Config:
        schema_extra = {"example": {"emails": "user1@gmail.com, user2@gmail.com", "showInfo": False}}


# API 서비스 등록 (Admin only)
@services_router.post("", response_model=schemas.ServiceCreateResponse)
async def create_service(
    service: schemas.ServiceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자만 서비스를 등록할 수 있습니다.",
        )

    # 서비스 ID 생성
    service_id = str(uuid.uuid4())[:8]

    try:
        # URL 파싱
        url_info = auth.parse_service_url(service.url)
        print("[DEBUG] Service URL info:", url_info)

        # 프로토콜 설정 (service.protocol이 명시적으로 지정된 경우 우선 사용)
        protocol = service.protocol if service.protocol else url_info["protocol"]

        # 호스트 유효성 검사
        if not url_info["host"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="호스트 주소가 필요합니다.",
            )

        # 서비스 데이터 준비
        db_service = models.Service(
            id=service_id,
            name=service.name,
            protocol=protocol,
            host=url_info["host"],
            port=url_info["port"] if url_info["port"] else None,  # 포트가 없으면 None 사용
            base_path=url_info["path"],
            description=service.description,
            show_info=service.show_info,
            is_ip=url_info["is_ip"],
            group_id=service.group_id,  # 그룹 ID 추가
        )

        db.add(db_service)
        db.flush()  # 실제 DB 작업을 수행하지만 commit하지는 않음

        # Nginx 설정 업데이트
        try:
            auth.update_nginx_config(db_service)
            nginx_updated = True
        except Exception as e:
            print(f"[ERROR] Nginx 설정 업데이트 실패: {str(e)}")
            nginx_updated = False
            # Nginx 설정 실패 시에도 서비스는 등록

        db.commit()
        db.refresh(db_service)

        # 원본 URL 그대로 반환
        return {
            "id": db_service.id,
            "name": db_service.name,
            "protocol": db_service.protocol,
            "url": service.url,  # 원본 URL 사용
            "description": db_service.description,
            "show_info": db_service.show_info,
            "nginx_url": f"/api/{db_service.id}/",
            "nginxUpdated": nginx_updated,
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"서비스 등록 실패: {str(e)}",
        )


# 서비스에 사용자 추가
@services_router.post("/{service_id}/users")
async def add_users_to_service(
    service_id: str,
    user_data: ServiceUserAdd,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """서비스에 사용자를 추가합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근 가능합니다")

    # 디버그 로깅 추가
    print(f"[DEBUG] 서비스에 사용자 추가: {service_id}")

    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        print(f"[ERROR] 서비스를 찾을 수 없음: {service_id}")
        raise HTTPException(status_code=404, detail=f"서비스를 찾을 수 없습니다. ID: {service_id}")

    try:
        email_list = []
        if user_data.emails:
            email_list = [email.strip() for email in user_data.emails.split(",") if email.strip()]

        print(f"[DEBUG] 추가할 이메일 목록: {email_list}")
        results = {"success": [], "not_found": [], "already_added": []}

        for email in email_list:
            user = db.query(models.User).filter(models.User.email == email).first()
            if not user:
                results["not_found"].append(email)
                continue

            # 현재 서비스에 대한 사용자 연결 확인
            existing_connection = (
                db.query(user_services)
                .filter(user_services.c.service_id == service_id, user_services.c.user_id == user.id)
                .first()
            )

            if existing_connection:
                results["already_added"].append(email)
                continue

            # 새로운 서비스-사용자 연결 추가
            stmt = user_services.insert().values(service_id=service_id, user_id=user.id, show_info=user_data.showInfo)
            db.execute(stmt)

            # 서비스 요청 자동 승인 처리
            new_request = models.ServiceRequest(
                user_id=user.id,
                service_id=service_id,
                status=RequestStatus.APPROVED,
                request_date=datetime.utcnow(),
                response_date=datetime.utcnow(),
                admin_created=True,
            )
            db.add(new_request)
            results["success"].append(email)

        db.commit()
        return results
    except Exception as e:
        db.rollback()
        print(f"[ERROR] 사용자 추가 중 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail=f"사용자 추가 중 오류가 발생했습니다: {str(e)}")


# 사용자 추가 전 검증을 위한 엔드포인트
@services_router.post("/{service_id}/users/validate")
async def validate_service_users(
    service_id: str,
    user_data: ServiceUserAdd,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """
    서비스에 추가할 사용자의 유효성을 검증합니다.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근 가능합니다")

    # 디버그 로깅 추가
    print(f"[DEBUG] 서비스 ID 검증: {service_id}")

    # 서비스 존재 여부 확인
    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        print(f"[ERROR] 서비스를 찾을 수 없음: {service_id}")
        raise HTTPException(status_code=404, detail=f"서비스를 찾을 수 없습니다. ID: {service_id}")

    # 이메일 목록 파싱 및 중복 제거
    try:
        email_list = []
        if user_data.emails:
            email_list = list(set([email.strip() for email in user_data.emails.split(",") if email.strip()]))

        print(f"[DEBUG] 검증할 이메일 목록: {email_list}")
        results = {"valid_users": [], "not_found": [], "already_added": []}

        for email in email_list:
            if not email.endswith(f"@{ALLOWED_DOMAIN}"):
                results["not_found"].append({"email": email, "reason": "올바른 도메인이 아닙니다."})
                continue

            user = db.query(models.User).filter(models.User.email == email).first()
            if not user:
                results["not_found"].append({"email": email, "reason": "등록되지 않은 사용자입니다."})
                continue

            # 사용자가 이미 해당 서비스에 추가되어 있는지 확인하는 방식 변경
            existing_connection = (
                db.query(user_services)
                .filter(user_services.c.service_id == service_id, user_services.c.user_id == user.id)
                .first()
            )

            if existing_connection:
                results["already_added"].append({"email": email, "user_id": user.id})
                continue

            results["valid_users"].append({"email": email, "user_id": user.id, "name": user.email.split("@")[0]})

        return results
    except Exception as e:
        print(f"[ERROR] 사용자 유효성 검증 중 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail=f"사용자 유효성 검증 중 오류가 발생했습니다: {str(e)}")


# 서비스별 사용자 목록 조회 수정
@services_router.get("/{service_id}/users", response_model=List[schemas.User])
async def get_service_users(
    service_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    # 사용자 객체 내의 서비스 목록에 url 속성 추가
    for user in service.users:
        for user_service in user.services:
            user_service.url = user_service.full_url

    return service.users


# 서비스에 추가 가능한 사용자 목록 조회 API 수정
@services_router.get("/{service_id}/available-users", response_model=List[schemas.User])
async def get_available_users(
    service_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    # 현재 서비스에 이미 추가된 사용자 ID 목록
    existing_user_ids = db.query(user_services.c.user_id).filter(user_services.c.service_id == service_id).subquery()

    # 아직 추가되지 않은 모든 사용자 목록 반환 (관리자 포함)
    available_users = (
        db.query(models.User)
        .filter(~models.User.id.in_(existing_user_ids))  # 관리자 필터링 제거
        .order_by(models.User.is_admin.desc(), models.User.email)  # 관리자가 먼저 나오도록 정렬
        .all()
    )

    # 사용자 객체 내의 서비스 목록에 url 속성 추가
    for user in available_users:
        for user_service in user.services:
            user_service.url = user_service.full_url

    return available_users


# 서비스 사용자별 정보 공개 설정
@services_router.put("/{service_id}/users/{user_id}")
async def update_service_user_visibility(
    service_id: str,
    user_id: int,
    show_info: bool,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    # user_services 테이블에서 해당 레코드 찾기
    stmt = (
        user_services.update()
        .where(and_(user_services.c.service_id == service_id, user_services.c.user_id == user_id))
        .values(show_info=show_info)
    )

    db.execute(stmt)
    db.commit()

    return {"status": "success", "message": "User service visibility updated"}


# 서비스 사용자 삭제
@services_router.delete("/{service_id}/users/{user_id}")
async def delete_service_user(
    service_id: str,
    user_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        # 1. user_services 테이블에서 해당 레코드 삭제
        stmt = user_services.delete().where(
            and_(user_services.c.service_id == service_id, user_services.c.user_id == user_id)
        )
        result = db.execute(stmt)

        # 2. ServiceRequest 테이블에서 관련 요청 삭제
        db.query(models.ServiceRequest).filter(
            models.ServiceRequest.service_id == service_id, models.ServiceRequest.user_id == user_id
        ).delete()

        db.commit()

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="User service not found")

        return {"status": "success", "message": "User removed from service"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# 서비스 일괄 추가를 위한 스키마
class BulkServiceCreate(BaseModel):
    services: List[schemas.ServiceCreate]


# JSON 파일을 통한 서비스 일괄 추가
@services_router.post("/upload", response_model=dict)
async def upload_services(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        content = await file.read()
        services_data = json.loads(content)

        results = {"success": [], "failed": []}

        for service_data in services_data:
            try:
                service = schemas.ServiceCreate(**service_data)
                created_service = auth.create_service(db, service)
                results["success"].append({"name": service.name, "id": created_service.id})
            except Exception as e:
                results["failed"].append({"name": service_data.get("name", "Unknown"), "error": str(e)})

        return results
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 여러 서비스 동시 추가
@services_router.post("/bulk", response_model=dict)
async def create_services_bulk(
    services: BulkServiceCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    results = {"success": [], "failed": []}

    for service in services.services:
        try:
            created_service = auth.create_service(db, service)
            results["success"].append({"name": service.name, "id": created_service.id})
        except Exception as e:
            results["failed"].append({"name": service.name, "error": str(e)})

    return results


@services_router.get("/status", response_model=Dict[str, Dict[str, str]])
async def get_services_status(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    try:
        services_status = {}
        services = db.query(models.Service).all()

        for service in services:
            if current_user.is_admin:
                status = "available"
            else:
                request = (
                    db.query(models.ServiceRequest)
                    .filter(
                        models.ServiceRequest.user_id == current_user.id,
                        models.ServiceRequest.service_id == service.id,
                        models.ServiceRequest.status == RequestStatus.APPROVED,
                    )
                    .first()
                )
                status = "available" if request else "unavailable"

            try:
                if service.is_ip:
                    # IP 주소인 경우 직접 연결 시도
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(1)
                    result = sock.connect_ex((service.host, service.port))
                    is_running = result == 0
                    sock.close()
                else:
                    # 도메인인 경우 HTTP(S) 요청으로 확인
                    async with httpx.AsyncClient(verify=False) as client:
                        # 기본 URL 생성
                        url = f"{service.protocol}://{service.host}"

                        # 포트가 있고, 기본 포트가 아닌 경우에만 포트 추가
                        if service.port is not None:
                            if (service.protocol == "http" and service.port != 80) or (
                                service.protocol == "https" and service.port != 443
                            ):
                                url += f":{service.port}"

                        if service.base_path:
                            url += service.base_path
                        response = await client.get(url, timeout=5.0)
                        is_running = 200 <= response.status_code < 500
            except:
                is_running = False

            services_status[str(service.id)] = {"access": status, "running": "online" if is_running else "offline"}

        return services_status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 서비스 사용자 접근 권한 변경
@services_router.put("/{service_id}/users/{user_id}/permission")
async def update_user_permission(
    service_id: str,
    user_id: int,
    show_info: bool,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    # user_services 테이블에서 해당 레코드 찾기
    stmt = (
        user_services.update()
        .where(and_(user_services.c.service_id == service_id, user_services.c.user_id == user_id))
        .values(show_info=show_info)
    )

    db.execute(stmt)
    db.commit()

    return {"status": "success", "message": "User permission updated"}


# 서비스별 사용자 접근 권한 조회
@services_router.get("/{service_id}/users/{user_id}/permission", response_model=dict)
async def get_user_permission(
    service_id: str,
    user_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    # user_services 테이블에서 해당 레코드 찾기
    user_service = (
        db.query(user_services)
        .filter(user_services.c.service_id == service_id, user_services.c.user_id == user_id)
        .first()
    )

    if not user_service:
        raise HTTPException(status_code=404, detail="User service not found")

    return {"service_id": service_id, "user_id": user_id, "show_info": user_service.show_info}


# 서비스별 사용자 정보 공개 설정 수정
@services_router.put("/{service_id}/users/{user_id}/show-info")
async def set_show_info(
    service_id: str,
    user_id: int,
    show_info: bool,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    # user_services 테이블에서 해당 레코드 찾기
    user_service = (
        db.query(user_services)
        .filter(user_services.c.service_id == service_id, user_services.c.user_id == user_id)
        .first()
    )

    if not user_service:
        raise HTTPException(status_code=404, detail="User service not found")

    # show_info 값 업데이트
    user_service.show_info = show_info
    db.commit()

    return {"status": "success", "message": "User show_info permission updated"}


@services_router.get("/my-approved-services", response_model=List[schemas.Service])
async def get_my_approved_services(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    """현재 사용자가 접근 가능한 서비스 목록을 반환합니다."""
    try:
        # 1. user_services 테이블을 통해 승인된 서비스 조회
        approved_services = (
            db.query(models.Service)
            .join(models.user_services)
            .filter(models.user_services.c.user_id == current_user.id)
        )

        # 2. user_allowed_services 테이블을 통해 허용된 서비스만 필터링
        services = (
            approved_services.join(models.user_allowed_services)
            .filter(models.user_allowed_services.c.user_id == current_user.id)
            .all()
        )

        # URL 속성 추가
        for service in services:
            service.url = service.full_url

        return services
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"승인된 서비스 목록을 가져오는 중 오류가 발생했습니다: {str(e)}")


@services_router.get("/available-services", response_model=List[schemas.Service])
async def get_available_services(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    """현재 사용자가 요청할 수 있는 서비스 목록을 반환합니다."""
    # 관리자는 모든 서비스를 볼 수 있음
    if current_user.is_admin:
        services = db.query(models.Service).all()
        # URL 속성 추가
        for service in services:
            service.url = service.full_url
        return services

    # 1. 이미 요청했거나 승인된 서비스 ID 목록
    existing_requests = (
        db.query(models.ServiceRequest.service_id)
        .filter(
            models.ServiceRequest.user_id == current_user.id,
            models.ServiceRequest.status.in_([RequestStatus.PENDING, RequestStatus.APPROVED]),
        )
        .subquery()
    )


@services_router.put("/{service_id}", response_model=schemas.ServiceCreateResponse)
async def update_service(
    service_id: str,
    service: schemas.ServiceCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """서비스 정보를 수정합니다."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자만 서비스를 수정할 수 있습니다.",
        )

    try:
        # 기존 서비스 조회
        db_service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not db_service:
            raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다")

        # URL 파싱
        url_info = auth.parse_service_url(service.url)
        print("[DEBUG] Service URL info:", url_info)

        # 프로토콜 설정
        protocol = service.protocol if service.protocol else url_info["protocol"]

        # 호스트 유효성 검사
        if not url_info["host"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="호스트 주소가 필요합니다.",
            )

        # URL 변경 여부 확인
        url_changed = (
            db_service.protocol != protocol
            or db_service.host != url_info["host"]
            or db_service.port != (url_info["port"] if url_info["port"] else None)
            or db_service.base_path != url_info["path"]
        )

        # 서비스 데이터 업데이트
        db_service.name = service.name
        db_service.protocol = protocol
        db_service.host = url_info["host"]
        db_service.port = url_info["port"] if url_info["port"] else None
        db_service.base_path = url_info["path"]
        db_service.description = service.description
        db_service.show_info = service.show_info
        db_service.is_ip = url_info["is_ip"]
        db_service.group_id = service.group_id  # 그룹 ID 업데이트

        db.commit()
        db.refresh(db_service)

        # 원본 URL 그대로 반환
        return {
            "id": db_service.id,
            "name": db_service.name,
            "protocol": db_service.protocol,
            "url": service.url,  # 원본 URL 사용
            "description": db_service.description,
            "show_info": db_service.show_info,
            "nginx_url": f"/api/{db_service.id}/",
            "nginxUpdated": True,
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"서비스 수정 실패: {str(e)}",
        )


@services_router.get("/access/user-stats")
async def get_user_access_stats(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """사용자별 접속 통계를 조회합니다. 관리자만 접근 가능합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다.")

    # 오늘 날짜 기준
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # 사용자별 통계 계산
    user_stats = []
    users = db.query(models.User).all()

    for user in users:
        # 현재 활성 세션 수
        active_sessions = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(models.ServiceAccess.user_id == user.id, models.ServiceAccess.is_active == True)
            .scalar()
            or 0
        )

        # 오늘 총 접속 수
        today_accesses = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(models.ServiceAccess.user_id == user.id, models.ServiceAccess.access_time >= today_start)
            .scalar()
            or 0
        )

        # 전체 접속 수
        total_accesses = (
            db.query(func.count(models.ServiceAccess.id)).filter(models.ServiceAccess.user_id == user.id).scalar() or 0
        )

        # 마지막 접속 시간
        last_access = (
            db.query(models.ServiceAccess.access_time)
            .filter(models.ServiceAccess.user_id == user.id)
            .order_by(models.ServiceAccess.access_time.desc())
            .first()
        )

        last_access_time = last_access[0] if last_access else None

        user_stats.append(
            {
                "user_id": user.id,
                "email": user.email,
                "is_admin": user.is_admin,
                "active_sessions": active_sessions,
                "today_accesses": today_accesses,
                "total_accesses": total_accesses,
                "last_access": last_access_time.isoformat() if last_access_time else None,
            }
        )

    return user_stats


# 모든 서비스 목록 조회 (관리자용)
@services_router.get("", response_model=List[schemas.Service])
async def get_all_services(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """모든 서비스 목록을 조회합니다. (관리자 전용)"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 모든 서비스를 조회할 수 있습니다.")

    services = db.query(models.Service).all()

    # 각 서비스에 url 필드 추가
    for service in services:
        service.url = service.full_url

    return services


# 서비스 접근 권한 확인
@services_router.get("/verify-service-access")
async def verify_service_access(
    serviceId: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    """사용자가 특정 서비스에 접근할 권한이 있는지 확인합니다."""
    try:
        # 관리자는 모든 서비스에 접근 가능
        if current_user.is_admin:
            return {"allowed": True, "message": "관리자 권한으로 접근 가능합니다."}

        # 서비스 존재 여부 확인
        service = db.query(models.Service).filter(models.Service.id == serviceId).first()
        if not service:
            return {"allowed": False, "message": "서비스를 찾을 수 없습니다."}

        # 사용자의 서비스 접근 권한 확인
        user_service = (
            db.query(user_services)
            .filter(user_services.c.service_id == serviceId, user_services.c.user_id == current_user.id)
            .first()
        )

        if user_service:
            return {"allowed": True, "message": "서비스에 접근할 수 있습니다."}
        else:
            return {"allowed": False, "message": "서비스에 접근 권한이 없습니다."}

    except Exception as e:
        return {"allowed": False, "message": f"오류가 발생했습니다: {str(e)}"}


# 서비스 접근 기록 저장
@services_router.post("/access")
async def record_service_access(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """서비스 접근 기록을 저장합니다."""
    try:
        # 요청 본문 파싱
        body = await request.json()
        service_id = body.get("service_id")
        session_id = body.get("session_id")

        # 현재 로그인한 사용자 ID를 항상 사용
        user_id = current_user.id if current_user else None

        # 디버깅 로그 추가
        print(f"[접근 기록] 서비스 ID: {service_id}, 사용자 ID: {user_id}, 세션 ID: {session_id}")

        if not service_id:
            # 쿼리 파라미터에서 확인
            service_id = request.query_params.get("service_id")
            if not service_id:
                raise HTTPException(status_code=400, detail="서비스 ID가 필요합니다.")

        # 서비스 존재 여부 확인
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다.")

        # 세션 ID가 없으면 생성
        if not session_id:
            session_id = secrets.token_hex(16)

        # 클라이언트 정보 가져오기
        client_host = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent", "")

        # 이미 존재하는 활성 세션인지 확인
        existing_session = (
            db.query(models.ServiceAccess)
            .filter(models.ServiceAccess.session_id == session_id, models.ServiceAccess.is_active == True)
            .first()
        )

        # 접근 기록 생성
        access_record = models.ServiceAccess(
            service_id=service_id,
            user_id=user_id,  # 현재 로그인한 사용자 ID 사용
            ip_address=client_host,
            user_agent=user_agent,
            session_id=session_id,
            access_time=datetime.utcnow(),
            is_active=True,
            last_activity=datetime.utcnow(),
        )

        db.add(access_record)
        db.commit()
        db.refresh(access_record)

        print(f"[접근 기록] 새 세션 생성: {session_id}, ID: {access_record.id}")
        return {"status": "success", "session_id": session_id, "action": "created"}
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        print(f"[오류] 접근 기록 저장 중 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=f"접근 기록 저장 중 오류가 발생했습니다: {str(e)}")


# 하트비트 전송 API - 세션 활성 상태 유지
@services_router.post("/heartbeat")
@services_router.get("/heartbeat")
async def send_heartbeat(
    request: Request,
    db: Session = Depends(get_db),
):
    """세션의 활성 상태를 유지하기 위한 하트비트를 전송합니다."""
    try:
        # 세션 ID 찾기 (요청 본문이나 쿼리 파라미터에서)
        session_id = None

        # POST 요청일 경우 본문에서 확인
        if request.method == "POST":
            try:
                body = await request.json()
                session_id = body.get("session_id")
            except:
                pass

        # 세션 ID가 없으면 쿼리 파라미터에서 확인
        if not session_id:
            session_id = request.query_params.get("session_id")

        if not session_id:
            raise HTTPException(status_code=400, detail="세션 ID가 필요합니다.")

        # 세션 검색
        session = (
            db.query(models.ServiceAccess)
            .filter(models.ServiceAccess.session_id == session_id, models.ServiceAccess.is_active == True)
            .first()
        )

        if not session:
            raise HTTPException(status_code=404, detail="활성 세션을 찾을 수 없습니다.")

        # 세션 활성 시간 업데이트
        session.last_activity = datetime.utcnow()
        db.commit()

        return {"status": "success", "session_id": session_id}
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"하트비트 처리 중 오류가 발생했습니다: {str(e)}")


# 세션 종료 API
@services_router.post("/session/end")
async def end_session(
    request: Request,
    db: Session = Depends(get_db),
):
    """세션을 종료합니다."""
    try:
        # 세션 ID 찾기 (요청 본문이나 쿼리 파라미터에서)
        session_id = None

        # POST 요청일 경우 본문에서 확인
        try:
            body = await request.json()
            session_id = body.get("session_id")
        except:
            pass

        # 세션 ID가 없으면 쿼리 파라미터에서 확인
        if not session_id:
            session_id = request.query_params.get("session_id")

        if not session_id:
            raise HTTPException(status_code=400, detail="세션 ID가 필요합니다.")

        # 세션 검색
        session = db.query(models.ServiceAccess).filter(models.ServiceAccess.session_id == session_id).first()

        if not session:
            raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

        # 세션 종료 처리
        session.is_active = False
        session.end_time = datetime.utcnow()
        db.commit()

        return {"status": "success", "session_id": session_id}
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"세션 종료 중 오류가 발생했습니다: {str(e)}")


# 서비스 삭제 API 추가
@services_router.delete("/{service_id}")
async def delete_service(
    service_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """서비스를 삭제합니다. (관리자 전용)"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 서비스를 삭제할 수 있습니다.")

    try:
        # 서비스 존재 여부 확인
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다.")

        # 1. 서비스 접근 기록 삭제
        db.query(models.ServiceAccess).filter(models.ServiceAccess.service_id == service_id).delete()

        # 2. 서비스 상태 기록 삭제
        db.query(models.ServiceStatus).filter(models.ServiceStatus.service_id == service_id).delete()

        # 3. 서비스 요청 삭제
        db.query(models.ServiceRequest).filter(models.ServiceRequest.service_id == service_id).delete()

        # 4. user_services 연결 삭제
        stmt = user_services.delete().where(user_services.c.service_id == service_id)
        db.execute(stmt)

        # 5. 서비스 삭제
        db.delete(service)
        db.commit()

        # 6. Nginx 설정 업데이트 (선택적)
        try:
            # Nginx 설정 파일에서 서비스 관련 항목 제거
            auth.remove_service_from_nginx(service_id)
        except Exception as e:
            # Nginx 설정 실패 시에도 진행
            print(f"[WARNING] Nginx 설정 업데이트 실패: {str(e)}")
            pass

        return {
            "status": "success",
            "message": f"서비스 '{service.name}' (ID: {service_id})가 성공적으로 삭제되었습니다.",
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"서비스 삭제 중 오류가 발생했습니다: {str(e)}")


# 대기 중인 서비스 요청 수 가져오기
@services_router.get("/pending-requests/count", response_model=schemas.PendingRequestsCount)
async def get_pending_requests_count(
    db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)
):
    """관리자용: 대기 중인 서비스 요청 수를 반환합니다."""

    # 관리자 권한 확인
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자만 이 기능을 사용할 수 있습니다.",
        )

    try:
        # 대기 중인 요청 수 계산
        pending_count = db.query(models.ServiceRequest).filter(models.ServiceRequest.status == "pending").count()

        return {"count": pending_count}
    except Exception as e:
        # 데이터베이스 쿼리 실패 시 오류 처리
        print(f"[ERROR] 대기 중인 요청 수 조회 중 오류 발생: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"대기 중인 요청 수 조회 중 오류가 발생했습니다: {str(e)}",
        )
