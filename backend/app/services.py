from fastapi import FastAPI, Depends, HTTPException, Header, File, UploadFile, APIRouter, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from . import models, schemas, database, auth
from typing import List, Optional, Dict
from .database import engine, SessionLocal, get_db
from jose import jwt, JWTError
from .config import SECRET_KEY, ALGORITHM, ALLOWED_DOMAIN
from datetime import datetime, timedelta
from .models import RequestStatus, ServiceStatus, Service
from pydantic import BaseModel
from sqlalchemy import update, and_
from .models import user_services  # user_services 테이블 import
import json
import socket
import os
import httpx
import asyncio
import subprocess
from .auth import update_nginx_config  # auth.py의 함수 import
import uuid

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
    emails: str  # 쉼표로 구분된 이메일 목록
    showInfo: bool = False  # IP:PORT 정보 공개 여부


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
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    email_list = [email.strip() for email in user_data.emails.split(",")]
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


# 사용자 추가 전 검증을 위한 엔드포인트
@services_router.post("/{service_id}/users/validate")
async def validate_service_users(
    service_id: str,
    user_data: ServiceUserAdd,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    # 이메일 목록 파싱 및 중복 제거
    email_list = list(set([email.strip() for email in user_data.emails.split(",")]))
    results = {"valid_users": [], "not_found": [], "already_added": []}

    for email in email_list:
        if not email.endswith(f"@{ALLOWED_DOMAIN}"):
            results["not_found"].append({"email": email, "reason": "올바른 도메인이 아닙니다."})
            continue

        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            results["not_found"].append({"email": email, "reason": "등록되지 않은 사용자입니다."})
            continue

        if service in user.services:
            results["already_added"].append({"email": email, "user_id": user.id})
            continue

        results["valid_users"].append({"email": email, "user_id": user.id})

    return results


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
        return db.query(models.Service).all()

    # 1. 이미 요청했거나 승인된 서비스 ID 목록
    existing_requests = (
        db.query(models.ServiceRequest.service_id)
        .filter(
            models.ServiceRequest.user_id == current_user.id,
            models.ServiceRequest.status.in_([RequestStatus.PENDING, RequestStatus.APPROVED]),
        )
        .subquery()
    )

    # 2. 관리자가 허용한 서비스 중에서 아직 요청하지 않은 서비스만 반환
    available_services = (
        db.query(models.Service)
        .join(models.user_allowed_services)
        .filter(
            models.user_allowed_services.c.user_id == current_user.id,  # 관리자가 허용한 서비스만
            ~models.Service.id.in_(existing_requests),  # 아직 요청하지 않은 것만
        )
        .all()
    )

    return available_services


@services_router.post("/{service_id}/allow-users")
async def allow_users_to_request(
    service_id: str,
    user_data: ServiceUserAdd,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """특정 서비스에 대해 사용자들의 요청 권한을 부여합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    email_list = [email.strip() for email in user_data.emails.split(",")]
    results = {"success": [], "not_found": [], "already_allowed": []}

    for email in email_list:
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            results["not_found"].append(email)
            continue

        # 이미 허용된 사용자인지 확인
        existing_permission = (
            db.query(models.user_allowed_services)
            .filter(
                models.user_allowed_services.c.service_id == service_id,
                models.user_allowed_services.c.user_id == user.id,
            )
            .first()
        )

        if existing_permission:
            results["already_allowed"].append(email)
            continue

        # 새로운 허용 추가
        stmt = models.user_allowed_services.insert().values(service_id=service_id, user_id=user.id)
        db.execute(stmt)
        results["success"].append(email)

    db.commit()
    return results


# 관리자가 사용자에게 서비스 요청 권한을 부여하는 API
@services_router.post("/users/{user_id}/allow-services")
async def allow_services_for_user(
    user_id: int,
    service_ids: List[str],
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """특정 사용자에게 여러 서비스의 요청 권한을 부여합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    results = {"success": [], "already_allowed": [], "not_found": []}

    for service_id in service_ids:
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            results["not_found"].append(service_id)
            continue

        # 이미 허용된 서비스인지 확인
        existing = (
            db.query(models.user_allowed_services)
            .filter(
                models.user_allowed_services.c.user_id == user_id,
                models.user_allowed_services.c.service_id == service_id,
            )
            .first()
        )

        if existing:
            results["already_allowed"].append(service.name)
            continue

        # 새로운 허용 추가
        stmt = models.user_allowed_services.insert().values(user_id=user_id, service_id=service_id)
        db.execute(stmt)
        results["success"].append(service.name)

    db.commit()
    return results


# 관리자가 사용자별로 허용된 서비스 목록을 조회하는 API
@services_router.get("/users/{user_id}/allowed-services", response_model=List[schemas.Service])
async def get_user_allowed_services(
    user_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """특정 사용자에게 허용된 서비스 목록을 반환합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    services = (
        db.query(models.Service)
        .join(models.user_allowed_services)
        .filter(models.user_allowed_services.c.user_id == user_id)
        .all()
    )

    return services


@services_router.get("", response_model=List[schemas.Service])
async def get_services(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """서비스 목록을 반환합니다."""
    try:
        # 관리자는 모든 서비스를 볼 수 있음
        if current_user.is_admin:
            services = db.query(models.Service).all()
            for service in services:
                service.url = service.full_url  # full_url 프로퍼티 사용
            return services

        # 일반 사용자는 승인된 서비스만 볼 수 있음
        services = (
            db.query(models.Service)
            .join(models.user_services)
            .filter(models.user_services.c.user_id == current_user.id)
            .all()
        )
        for service in services:
            service.url = service.full_url  # full_url 프로퍼티 사용
        return services
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"서비스 목록을 가져오는 중 오류가 발생했습니다: {str(e)}")


@services_router.post("/service-requests/{service_id}", response_model=schemas.ServiceRequest)
async def create_service_request(
    service_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """서비스 접근 요청을 생성합니다."""
    try:
        # 서비스 존재 여부 확인
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            raise HTTPException(status_code=404, detail="Service not found")

        # 이미 요청했거나 승인된 요청이 있는지 확인
        existing_request = (
            db.query(models.ServiceRequest)
            .filter(
                models.ServiceRequest.user_id == current_user.id,
                models.ServiceRequest.service_id == service_id,
                models.ServiceRequest.status.in_([RequestStatus.PENDING, RequestStatus.APPROVED]),
            )
            .first()
        )

        if existing_request:
            raise HTTPException(status_code=400, detail="이미 해당 서비스에 대한 요청이 존재합니다.")

        # 새로운 요청 생성
        new_request = models.ServiceRequest(
            user_id=current_user.id,
            service_id=service_id,
            status=RequestStatus.PENDING,
            request_date=datetime.utcnow(),
            admin_created=False,
            user_removed=False,
        )

        db.add(new_request)
        db.commit()
        db.refresh(new_request)

        return new_request

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"서비스 요청 생성 중 오류가 발생했습니다: {str(e)}")


@services_router.put("/service-requests/{request_id}/approve")
async def approve_service_request(
    request_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """서비스 요청을 승인합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    service_request = db.query(models.ServiceRequest).filter(models.ServiceRequest.id == request_id).first()
    if not service_request:
        raise HTTPException(status_code=404, detail="Request not found")

    try:
        service_request.status = RequestStatus.APPROVED
        service_request.response_date = datetime.utcnow()

        # user_services 테이블에 추가
        stmt = models.user_services.insert().values(
            user_id=service_request.user_id, service_id=service_request.service_id
        )
        db.execute(stmt)
        db.commit()

        return {"status": "success", "message": "Request approved"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@services_router.put("/service-requests/{request_id}/reject")
async def reject_service_request(
    request_id: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    """서비스 요청을 거절합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    service_request = db.query(models.ServiceRequest).filter(models.ServiceRequest.id == request_id).first()
    if not service_request:
        raise HTTPException(status_code=404, detail="Request not found")

    service_request.status = RequestStatus.REJECTED
    service_request.response_date = datetime.utcnow()
    db.commit()

    return {"status": "success", "message": "Request rejected"}


@services_router.delete("/service-requests/{request_id}")
async def cancel_service_request(
    request_id: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    """서비스 요청을 취소합니다."""
    service_request = (
        db.query(models.ServiceRequest)
        .filter(models.ServiceRequest.id == request_id, models.ServiceRequest.user_id == current_user.id)
        .first()
    )

    if not service_request:
        raise HTTPException(status_code=404, detail="Request not found")

    if service_request.status == RequestStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Cannot cancel approved request")

    db.delete(service_request)
    db.commit()

    return {"status": "success", "message": "Request cancelled"}


@services_router.get("/my-service-requests", response_model=List[schemas.ServiceRequestWithDetails])
async def get_my_service_requests(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    """현재 사용자의 서비스 요청 목록을 반환합니다."""
    try:
        requests = (
            db.query(models.ServiceRequest)
            .filter(models.ServiceRequest.user_id == current_user.id)
            .join(models.Service)  # 서비스 정보 포함
            .order_by(models.ServiceRequest.request_date.desc())
            .all()
        )
        return requests
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"서비스 요청 목록을 가져오는 중 오류가 발생했습니다: {str(e)}")


@services_router.get("/service-requests", response_model=List[schemas.ServiceRequestWithDetails])
async def get_all_service_requests(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    """모든 서비스 요청 목록을 반환합니다. (관리자용)"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        requests = (
            db.query(models.ServiceRequest)
            .join(models.User)  # 사용자 정보 포함
            .join(models.Service)  # 서비스 정보 포함
            .order_by(models.ServiceRequest.request_date.desc())
            .all()
        )
        return requests
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"서비스 요청 목록을 가져오는 중 오류가 발생했습니다: {str(e)}")


@services_router.post("/users/{user_id}/service-permissions")
async def update_user_service_permissions(
    user_id: int,
    request: schemas.ServiceIdsRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """특정 사용자의 서비스 권한을 업데이트합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 현재 허용된 서비스 ID 목록 조회
    current_permissions = (
        db.query(models.user_allowed_services.c.service_id)
        .filter(models.user_allowed_services.c.user_id == user_id)
        .all()
    )
    current_service_ids = {service_id for (service_id,) in current_permissions}
    new_service_ids = set(request.service_ids)

    # 제거할 서비스 권한
    to_remove = current_service_ids - new_service_ids
    # 추가할 서비스 권한
    to_add = new_service_ids - current_service_ids

    results = {"added": [], "removed": [], "not_found": []}

    # 권한 제거
    if to_remove:
        try:
            # 1. user_allowed_services 테이블에서 제거
            stmt = models.user_allowed_services.delete().where(
                and_(
                    models.user_allowed_services.c.user_id == user_id,
                    models.user_allowed_services.c.service_id.in_(to_remove),
                )
            )
            db.execute(stmt)

            # 2. user_services 테이블에서 제거 (승인된 서비스 접근 권한 제거)
            stmt = models.user_services.delete().where(
                and_(
                    models.user_services.c.user_id == user_id,
                    models.user_services.c.service_id.in_(to_remove),
                )
            )
            db.execute(stmt)

            # 3. service_requests 테이블에서 모든 관련 요청 제거 (상태와 관계없이)
            service_requests = db.query(models.ServiceRequest).filter(
                models.ServiceRequest.user_id == user_id,
                models.ServiceRequest.service_id.in_(to_remove),
            )
            for request in service_requests:
                db.delete(request)

            removed_services = db.query(models.Service).filter(models.Service.id.in_(to_remove)).all()
            results["removed"] = [service.name for service in removed_services]

            # 변경사항 커밋
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"서비스 권한 제거 중 오류가 발생했습니다: {str(e)}")

    # 권한 추가
    for service_id in to_add:
        try:
            service = db.query(models.Service).filter(models.Service.id == service_id).first()
            if not service:
                results["not_found"].append(service_id)
                continue

            stmt = models.user_allowed_services.insert().values(user_id=user_id, service_id=service_id)
            db.execute(stmt)
            results["added"].append(service.name)
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"서비스 권한 추가 중 오류가 발생했습니다: {str(e)}")

    return results


@services_router.get("/pending-requests/count")
async def get_pending_requests_count(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    """대기 중인 서비스 요청 개수를 반환합니다."""
    try:
        # 관리자는 전체 대기 요청 수
        if current_user.is_admin:
            count = (
                db.query(models.ServiceRequest).filter(models.ServiceRequest.status == RequestStatus.PENDING).count()
            )
        else:
            # 일반 사용자는 자신의 대기 요청 수
            count = (
                db.query(models.ServiceRequest)
                .filter(
                    models.ServiceRequest.user_id == current_user.id,
                    models.ServiceRequest.status == RequestStatus.PENDING,
                )
                .count()
            )

        return {"count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@services_router.delete("/{service_id}")
async def delete_service(
    service_id: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    """서비스를 삭제합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        # 서비스 조회
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            raise HTTPException(status_code=404, detail="Service not found")

        # 관련된 모든 데이터 삭제
        # 1. 서비스 요청 삭제
        db.query(models.ServiceRequest).filter(models.ServiceRequest.service_id == service_id).delete()

        # 2. 서비스 상태 이력 삭제
        db.query(models.ServiceStatus).filter(models.ServiceStatus.service_id == service_id).delete()

        # 3. user_services 관계 삭제
        db.execute(models.user_services.delete().where(models.user_services.c.service_id == service_id))

        # 4. user_allowed_services 관계 삭제
        db.execute(
            models.user_allowed_services.delete().where(models.user_allowed_services.c.service_id == service_id)
        )

        # 5. 서비스 삭제
        db.delete(service)
        db.commit()

        return {"status": "success", "message": "Service and related data deleted successfully"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"서비스 삭제 중 오류가 발생했습니다: {str(e)}")


@services_router.get("/verify-service-access")
async def verify_service_access(
    serviceId: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    """서비스 접근 권한을 확인합니다."""
    try:
        # 관리자는 모든 서비스에 접근 가능
        if current_user.is_admin:
            return {"allowed": True}

        # 서비스 존재 여부 확인
        service = db.query(models.Service).filter(models.Service.id == serviceId).first()
        if not service:
            raise HTTPException(status_code=404, detail="Service not found")

        # 사용자의 서비스 접근 권한 확인
        access_allowed = (
            db.query(models.user_services)
            .filter(models.user_services.c.user_id == current_user.id, models.user_services.c.service_id == serviceId)
            .first()
            is not None
        )

        # 접근 권한이 있는 경우 단기 토큰 발급
        if access_allowed:
            service_token = auth.create_access_token(
                data={"sub": current_user.email, "type": "service_access", "service_id": serviceId},
                expires_delta=timedelta(minutes=5),
            )
            return {"allowed": True, "token": service_token}
        print("접근 권한이 없습니다.")
        return {"allowed": False}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"서비스 접근 권한 확인 중 오류가 발생했습니다: {str(e)}")
