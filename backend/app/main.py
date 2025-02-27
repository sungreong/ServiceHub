from fastapi import FastAPI, Depends, HTTPException, Header, File, UploadFile, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from . import models, schemas, database, auth
from typing import List, Optional
from .database import engine, SessionLocal, get_db
from jose import jwt, JWTError
from .auth import SECRET_KEY, ALGORITHM
from datetime import datetime, timedelta
from .models import RequestStatus
from pydantic import BaseModel
from sqlalchemy import update, and_
from .models import user_services  # user_services 테이블 import
import json
import socket
import os
from .auth import SECRET_KEY, ALGORITHM
from .services import services_router
from .auth import auth_router  # auth_router import 추가
from fastapi.security import OAuth2PasswordRequestForm
from .config import ACCESS_TOKEN_EXPIRE_MINUTES

# 환경변수에서 도메인 가져오기 (기본값 gmail.com)
ALLOWED_DOMAIN = os.getenv("ALLOWED_DOMAIN", "gmail.com")

app = FastAPI()

# auth 라우터 포함
app.include_router(auth_router)
app.include_router(services_router)

# CORS 미들웨어 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Nginx 프록시 포트도 추가
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# 데이터베이스 의존성
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# 데이터베이스 테이블 재생성 (기존 데이터 삭제됨)
models.Base.metadata.drop_all(bind=engine)  # 기존 테이블 삭제
models.Base.metadata.create_all(bind=engine)  # 새로운 스키마로 테이블 생성


# 초기 관리자 계정 생성
def create_initial_admin():
    db = SessionLocal()
    try:
        # 관리자 계정이 이미 존재하는지 확인
        admin = db.query(models.User).filter(models.User.email == f"admin@{ALLOWED_DOMAIN}").first()
        if not admin:
            admin_user = schemas.UserCreate(email=f"admin@{ALLOWED_DOMAIN}", password="admin$01", is_admin=True)
            auth.create_user(
                db=db,
                user=admin_user,
                status=models.UserStatus.APPROVED,
                approval_date=datetime.utcnow(),
                registration_date=datetime.utcnow(),
            )
            print("관리자 계정이 생성되었습니다.")
    except Exception as e:
        print(f"관리자 계정 생성 중 오류 발생: {e}")
    finally:
        db.close()


# 테스트 데이터 생성 함수 수정
def create_test_data():
    db = SessionLocal()
    try:
        # 1. 테스트 사용자 생성 (자동 승인)
        test_users = [
            # 테스트 사용자
            schemas.UserCreate(email=f"test1@{ALLOWED_DOMAIN}", password="test123!"),
            schemas.UserCreate(email=f"test2@{ALLOWED_DOMAIN}", password="test123!"),
            schemas.UserCreate(email=f"test3@{ALLOWED_DOMAIN}", password="test123!"),
        ]

        for user_data in test_users:
            # 이미 존재하는 사용자 확인
            existing_user = db.query(models.User).filter(models.User.email == user_data.email).first()
            if not existing_user:
                # 자동 승인 상태로 생성
                user = models.User(
                    email=user_data.email,
                    hashed_password=auth.get_password_hash(user_data.password),
                    status=models.UserStatus.APPROVED,  # 자동 승인
                    approval_date=datetime.utcnow(),  # 승인 일자 설정
                )
                db.add(user)

        db.commit()

        # 2. 테스트 서비스 생성
        test_services = [
            # {
            #     "name": "test_service_1",
            #     "ip": "localhost",
            #     "port": 8501,
            #     "description": "테스트 서비스 1",
            # },
            # {
            #     "name": "test_service_2",
            #     "ip": "localhost",
            #     "port": 8502,
            #     "description": "테스트 서비스 2",
            # },
        ]

        for service_data in test_services:
            if not db.query(models.Service).filter(models.Service.name == service_data["name"]).first():
                service = models.Service(**service_data)
                db.add(service)
                print(f"테스트 서비스 생성: {service_data['name']}")

        db.commit()
        print("테스트 데이터가 성공적으로 생성되었습니다.")

    except Exception as e:
        print(f"테스트 데이터 생성 중 오류 발생: {e}")
        db.rollback()
    finally:
        db.close()


# 애플리케이션 시작 시 관리자 계정 생성 및 테스트 데이터 생성
@app.on_event("startup")
async def startup_event():
    create_initial_admin()  # 관리자 계정 생성
    create_test_data()  # 테스트 데이터 생성


# 회원가입
@app.post("/register", response_model=schemas.User)
async def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # 이메일 도메인 검증
    if not user.email.endswith(f"@{ALLOWED_DOMAIN}"):
        raise HTTPException(status_code=400, detail=f"@{ALLOWED_DOMAIN} 도메인만 가입 가능합니다.")

    # 이미 존재하는 이메일 확인
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="이미 등록된 이메일입니다.")

    # 사용자 생성 (승인 대기 상태로)
    db_user = models.User(
        email=user.email,
        hashed_password=auth.get_password_hash(user.password),
        status=models.UserStatus.PENDING,
        registration_date=datetime.utcnow(),  # 가입 신청일 추가
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


# Auth 엔드포인트 수정
@app.get("/auth")
async def auth_check(request: Request, db: Session = Depends(database.get_db)):
    try:
        # 헤더에서 토큰 추출
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            raise HTTPException(
                status_code=401,
                detail="No authorization token provided",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Bearer 토큰 형식 확인 및 토큰 추출
        if "Bearer" not in auth_header:
            token = auth_header  # Bearer가 없는 경우 전체를 토큰으로 간주
        else:
            token = auth_header.replace("Bearer ", "")

        try:
            # 토큰 검증
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            email: str = payload.get("sub")
            if not email:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid token payload",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # 사용자 확인
            user = db.query(models.User).filter(models.User.email == email).first()
            if not user:
                raise HTTPException(
                    status_code=401,
                    detail="User not found",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # 서비스 접근용 단기 토큰 발급
            service_token = auth.create_access_token(
                data={"sub": email, "type": "service_access"}, expires_delta=timedelta(minutes=5)
            )

            # 응답 설정
            response = Response(status_code=200)
            response.headers["X-User"] = email
            response.headers["Authorization"] = f"Bearer {service_token}"
            return response

        except JWTError as e:
            raise HTTPException(
                status_code=401,
                detail=f"Invalid token: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


# 서비스 삭제 엔드포인트 추가
@app.delete("/services/{service_id}")
def delete_service_endpoint(
    service_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    try:
        auth.delete_service(db, service_id)
        return {"status": "success", "message": "Service deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 관리자용: 서비스 요청 목록 조회 (사용자 정보 포함)
@app.get("/service-requests", response_model=List[schemas.ServiceRequestWithDetails])
async def get_service_requests(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근 가능합니다")

    # 모든 요청을 가져오되, 사용자와 서비스 정보도 함께 로드
    requests = (
        db.query(models.ServiceRequest)
        .join(models.User)
        .join(models.Service)
        .order_by(models.ServiceRequest.request_date.desc())
        .all()
    )

    # URL 속성 추가 - 각 요청의 서비스 객체 및 사용자 객체의 서비스 목록에 url 속성 추가
    for request in requests:
        # 서비스 요청의 서비스 객체에 url 추가
        if request.service:
            request.service.url = request.service.full_url

        # 사용자 객체의 서비스 객체들에도 url 추가
        if request.user and request.user.services:
            for service in request.user.services:
                service.url = service.full_url

    return requests


# 상태 업데이트를 위한 요청 모델들 추가
class ServiceRequestUpdate(BaseModel):
    status: str


class UserStatusUpdate(BaseModel):
    status: models.UserStatus


class ServiceUserAdd(BaseModel):
    emails: str
    showInfo: bool = False


# 관리자의 서비스 요청 처리
@app.put("/service-requests/{request_id}")
async def update_service_request(
    request_id: int,
    request_update: ServiceRequestUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    if request_update.status not in ["approved", "rejected", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid status value")

    db_request = db.query(models.ServiceRequest).filter(models.ServiceRequest.id == request_id).first()
    if not db_request:
        raise HTTPException(status_code=404, detail="Request not found")

    try:
        if request_update.status == "approved":
            if db_request.status == RequestStatus.PENDING:
                # 서비스 접근 요청 승인 시 user_services에 추가
                stmt = user_services.insert().values(
                    service_id=db_request.service_id, user_id=db_request.user_id, show_info=False
                )
                db.execute(stmt)
            elif db_request.status == RequestStatus.REMOVE_PENDING:
                # 서비스 제거 요청 승인 시 user_services에서 삭제
                stmt = user_services.delete().where(
                    and_(
                        user_services.c.service_id == db_request.service_id,
                        user_services.c.user_id == db_request.user_id,
                    )
                )
                db.execute(stmt)

        db_request.status = RequestStatus(request_update.status)
        db_request.response_date = datetime.utcnow()
        db.commit()

        return {"status": "success", "message": f"Request {request_update.status}"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# 사용자 목록 조회 (관리자용)
@app.get("/users", response_model=List[schemas.User])
async def get_users(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    users = db.query(models.User).all()

    # 사용자 객체 내의 서비스 목록에 url 속성 추가
    for user in users:
        for service in user.services:
            service.url = service.full_url

    return users


# 사용자 권한 변경 (관리자용)
@app.put("/users/{user_id}")
async def update_user(
    user_id: int,
    user_update: schemas.UserUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    # admin@<도메인계정:gmail.com> 계정은 수정 불가
    if user_id == 1:  # 보통 첫 번째 사용자가 기본 관리자
        raise HTTPException(status_code=403, detail="Cannot modify main admin account")

    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    for key, value in user_update.dict(exclude_unset=True).items():
        setattr(db_user, key, value)

    db.commit()
    return {"status": "success"}


# 사용자의 서비스 요청 목록 조회
@app.get("/my-service-requests", response_model=List[schemas.ServiceRequestWithDetails])
async def get_my_service_requests(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    requests = db.query(models.ServiceRequest).filter(models.ServiceRequest.user_id == current_user.id).all()

    # URL 속성 추가
    for request in requests:
        # 서비스 요청의 서비스 객체에 url 추가
        if request.service:
            request.service.url = request.service.full_url

        # 사용자 객체의 서비스 객체들에도 url 추가
        if request.user and request.user.services:
            for service in request.user.services:
                service.url = service.full_url

    return requests


# 요청 가능한 서비스 목록 조회 수정
@app.get("/available-services", response_model=List[schemas.Service])
async def get_available_services(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    """현재 사용자가 요청할 수 있는 서비스 목록을 반환합니다."""
    # 관리자는 모든 서비스에 접근 가능
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

    # URL 속성 추가
    for service in available_services:
        service.url = service.full_url

    return available_services


# 사용자의 승인된 서비스 목록 조회 수정
@app.get("/my-approved-services", response_model=List[schemas.Service])
async def get_my_approved_services(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    # 승인된 서비스 요청을 통해 서비스 목록 조회
    approved_services = (
        db.query(models.Service)
        .join(models.ServiceRequest)
        .filter(
            models.ServiceRequest.user_id == current_user.id, models.ServiceRequest.status == RequestStatus.APPROVED
        )
        .all()
    )

    # URL 속성 추가
    for service in approved_services:
        service.url = service.full_url

    return approved_services


# 사용자의 서비스 삭제 요청
@app.post("/my-services/{service_id}/remove-request")
async def request_service_removal(
    service_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    # 서비스 존재 여부 확인
    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail=f"Service ID {service_id}가 존재하지 않습니다.")

    # 현재 사용자의 승인된 서비스 요청 확인
    approved_request = (
        db.query(models.ServiceRequest)
        .filter(
            models.ServiceRequest.user_id == current_user.id,
            models.ServiceRequest.service_id == service_id,
            models.ServiceRequest.status == RequestStatus.APPROVED,
        )
        .first()
    )

    if not approved_request:
        raise HTTPException(status_code=404, detail="승인된 서비스 요청을 찾을 수 없습니다.")

    # 이미 삭제 요청이 있는지 확인
    existing_remove_request = (
        db.query(models.ServiceRequest)
        .filter(
            models.ServiceRequest.user_id == current_user.id,
            models.ServiceRequest.service_id == service_id,
            models.ServiceRequest.status == RequestStatus.REMOVE_PENDING,
        )
        .first()
    )

    if existing_remove_request:
        raise HTTPException(status_code=400, detail="이미 삭제 요청이 진행 중입니다.")

    # 기존 승인된 요청을 삭제 요청 상태로 변경
    approved_request.status = RequestStatus.REMOVE_PENDING
    approved_request.request_date = datetime.utcnow()
    approved_request.response_date = None

    db.commit()
    return {"status": "success", "message": "서비스 접근 해제 요청이 생성되었습니다."}


@app.put("/services/{service_id}/visibility")
async def update_service_visibility(
    service_id: int,
    show_info: bool,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    service.show_info = show_info
    db.commit()

    return {"status": "success", "message": "Service visibility updated"}


# 사용자 삭제 (관리자용)
@app.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    # admin@<도메인계정:gmail.com> 계정은 삭제 불가
    if user_id == 1:  # 보통 첫 번째 사용자가 기본 관리자
        raise HTTPException(status_code=403, detail="Cannot delete main admin account")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_admin:
        raise HTTPException(status_code=403, detail="Cannot delete admin users")

    try:
        # 사용자와 관련된 모든 서비스 요청 삭제
        db.query(models.ServiceRequest).filter(models.ServiceRequest.user_id == user_id).delete()

        # user_services 테이블에서 사용자 관련 레코드 삭제
        stmt = user_services.delete().where(user_services.c.user_id == user_id)
        db.execute(stmt)

        # 사용자 삭제
        db.delete(user)
        db.commit()
        return {"status": "success", "message": "User deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# 여러 사용자 삭제 (관리자용)
@app.delete("/users")
async def delete_multiple_users(
    user_ids: List[int],
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    if 1 in user_ids:  # admin 계정 보호
        raise HTTPException(status_code=403, detail="Cannot delete main admin account")

    # 사용자들의 서비스 요청 삭제
    db.query(models.ServiceRequest).filter(models.ServiceRequest.user_id.in_(user_ids)).delete(
        synchronize_session=False
    )

    # 사용자들 조회
    users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()

    # 각 사용자의 서비스 연결 해제
    for user in users:
        user.services = []

    # 사용자들 삭제
    db.query(models.User).filter(models.User.id.in_(user_ids)).delete(synchronize_session=False)

    db.commit()

    return {"status": "success", "message": f"{len(user_ids)} users and their related data deleted successfully"}


# 사용자 일괄 추가를 위한 스키마
class BulkUserCreate(BaseModel):
    users: List[schemas.UserCreate]


# JSON 파일을 통한 사용자 일괄 추가
@app.post("/users/upload", response_model=dict)
async def upload_users(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        content = await file.read()
        users_data = json.loads(content)

        results = {"success": [], "failed": []}

        for user_data in users_data:
            try:
                user = schemas.UserCreate(**user_data)
                # 관리자가 추가하는 사용자는 자동 승인
                db_user = models.User(
                    email=user.email,
                    hashed_password=auth.get_password_hash(user.password),
                    status=models.UserStatus.APPROVED,  # 자동 승인
                    approval_date=datetime.utcnow(),  # 승인 일자 설정
                )
                db.add(db_user)
                db.commit()
                results["success"].append({"email": user.email, "id": db_user.id})
            except Exception as e:
                results["failed"].append({"email": user_data.get("email", "Unknown"), "error": str(e)})

        return results
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 여러 사용자 동시 추가
@app.post("/users/bulk", response_model=dict)
async def create_users_bulk(
    users: BulkUserCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    results = {"success": [], "failed": []}

    for user in users.users:
        try:
            # 관리자가 추가하는 사용자는 자동 승인
            db_user = models.User(
                email=user.email,
                hashed_password=auth.get_password_hash(user.password),
                status=models.UserStatus.APPROVED,  # 자동 승인
                approval_date=datetime.utcnow(),  # 승인 일자 설정
            )
            db.add(db_user)
            db.commit()
            results["success"].append({"email": user.email, "id": db_user.id})
        except Exception as e:
            results["failed"].append({"email": user.email, "error": str(e)})

    return results


# 승인 대기 중인 사용자 목록 조회
@app.get("/users/pending", response_model=List[schemas.User])
async def get_pending_users(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    users = db.query(models.User).filter(models.User.status == models.UserStatus.PENDING).all()

    # 사용자 객체 내의 서비스 목록에 url 속성 추가
    for user in users:
        for service in user.services:
            service.url = service.full_url

    return users


# 사용자 승인/거절
@app.put("/users/{user_id}/status")
async def update_user_status(
    user_id: int,
    status_update: UserStatusUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.status = status_update.status
    if status_update.status == models.UserStatus.APPROVED:
        user.approval_date = datetime.utcnow()

    db.commit()
    return {"status": "success"}


# 사용자별 허용된 서비스 목록 조회
@app.get("/users/{user_id}/allowed-services", response_model=List[schemas.Service])
async def get_user_allowed_services(
    user_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """특정 사용자에게 허용된 서비스 목록을 반환합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근 가능합니다")

    services = (
        db.query(models.Service)
        .join(models.user_allowed_services)
        .filter(models.user_allowed_services.c.user_id == user_id)
        .all()
    )

    # URL 속성 추가
    for service in services:
        service.url = service.full_url

    return services


# 사용자에게 서비스 요청 권한 부여
@app.post("/users/{user_id}/allow-services")
async def allow_services_for_user(
    user_id: int,
    request: schemas.ServiceIdsRequest,
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

    # 기존 허용된 서비스 모두 제거
    stmt = models.user_allowed_services.delete().where(models.user_allowed_services.c.user_id == user_id)
    db.execute(stmt)

    # 새로운 서비스 권한 추가
    for service_id in request.service_ids:
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            results["not_found"].append(service_id)
            continue

        # 새로운 허용 추가
        stmt = models.user_allowed_services.insert().values(user_id=user_id, service_id=service_id)
        db.execute(stmt)
        results["success"].append(service.name)

    db.commit()
    return results


# 사용자별 서비스 권한 관리
@app.post("/users/{user_id}/service-permissions")
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
        stmt = models.user_allowed_services.delete().where(
            and_(
                models.user_allowed_services.c.user_id == user_id,
                models.user_allowed_services.c.service_id.in_(to_remove),
            )
        )
        db.execute(stmt)
        removed_services = db.query(models.Service).filter(models.Service.id.in_(to_remove)).all()
        results["removed"] = [service.name for service in removed_services]

    # 권한 추가
    for service_id in to_add:
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            results["not_found"].append(service_id)
            continue

        stmt = models.user_allowed_services.insert().values(user_id=user_id, service_id=service_id)
        db.execute(stmt)
        results["added"].append(service.name)

    db.commit()
    return results
