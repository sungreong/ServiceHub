from fastapi import FastAPI, Depends, HTTPException, Header, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from . import models, schemas, database, auth
from typing import List, Optional
from .database import engine, SessionLocal, get_db
from jose import jwt, JWTError
from .auth import SECRET_KEY, ALGORITHM
from datetime import datetime
from .models import RequestStatus
from pydantic import BaseModel
from sqlalchemy import update, and_
from .models import user_services  # user_services 테이블 import
import json
import socket
import os

app = FastAPI()

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
# models.Base.metadata.drop_all(bind=engine)  # 기존 테이블 삭제
# models.Base.metadata.create_all(bind=engine)  # 새로운 스키마로 테이블 생성


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


# 환경변수에서 도메인 가져오기 (기본값 gmail.com)
ALLOWED_DOMAIN = os.getenv("ALLOWED_DOMAIN", "gmail.com")


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


# 로그인
@app.post("/login")
def login(form_data: schemas.UserLogin, db: Session = Depends(get_db)):
    try:
        user = auth.authenticate_user(db, form_data.email, form_data.password)
        access_token = auth.create_access_token(data={"sub": user.email})
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_email": user.email,
            "is_admin": user.is_admin,
        }
    except HTTPException as e:
        if e.status_code == 404:
            # 사용자가 없는 경우
            raise HTTPException(
                status_code=404,
                detail={"type": "not_found", "message": "등록되지 않은 이메일입니다. 회원가입을 진행해주세요."},
            )
        elif e.status_code == 403 and e.detail.get("type") == "pending_approval":
            # 승인 대기 중인 경우
            raise HTTPException(
                status_code=403,
                detail={
                    "type": "pending_approval",
                    "message": "계정이 아직 승인되지 않았습니다.",
                    "registration_date": e.detail.get("registration_date"),
                },
            )
        raise e


# API 서비스 등록 (Admin only)
@app.post("/services", response_model=schemas.Service)
def create_service(
    service: schemas.ServiceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return auth.create_service(db, service)


# API 서비스 목록 조회
@app.get("/services", response_model=List[schemas.Service])
def get_services(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    try:
        services = auth.get_services(db)
        for service in services:
            setattr(service, "nginx_url", f"/api/{service.id}/")
        return services
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"서비스 목록을 가져오는 중 오류가 발생했습니다: {str(e)}")


# Auth 엔드포인트 수정
@app.get("/auth")
async def auth_check(db: Session = Depends(database.get_db), token: str = Header(None, alias="Authorization")):
    try:
        if not token:
            raise HTTPException(
                status_code=401,
                detail="No authorization token provided",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Bearer 토큰에서 실제 토큰 부분만 추출
        scheme, token = token.split()
        if scheme.lower() != "bearer":
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication scheme",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # auth.py의 get_current_user 로직 사용
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(
                status_code=401,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = db.query(models.User).filter(models.User.email == email).first()
        if user is None:
            raise HTTPException(
                status_code=401,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return {"status": "ok", "email": user.email}

    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Could not validate credentials",
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


@app.get("/verify-token")
async def verify_token(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    print(f"[DEBUG] Received authorization header: {authorization}")

    if not authorization:
        # 토큰이 없으면 기본 관리자 토큰 생성
        admin_user = db.query(models.User).filter(models.User.email == f"admin@{ALLOWED_DOMAIN}").first()
        if admin_user:
            token = auth.create_access_token(data={"sub": admin_user.email})
            return {"status": "ok", "token": token, "user": admin_user.email, "is_admin": admin_user.is_admin}

        raise HTTPException(status_code=401, detail="No authorization token provided")

    try:
        # Bearer 토큰 검증
        if "Bearer" in authorization:
            token = authorization.replace("Bearer ", "")
        else:
            token = authorization

        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_email = payload.get("sub")

        # 사용자 확인
        user = db.query(models.User).filter(models.User.email == user_email).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return {"status": "ok", "token": token, "user": user_email, "is_admin": user.is_admin}

    except Exception as e:
        # 토큰이 유효하지 않으면 새 토큰 생성
        admin_user = db.query(models.User).filter(models.User.email == f"admin@{ALLOWED_DOMAIN}").first()
        if admin_user:
            new_token = auth.create_access_token(data={"sub": admin_user.email})
            return {"status": "ok", "token": new_token, "user": admin_user.email, "is_admin": admin_user.is_admin}

        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")


# 서비스 접근 요청 처리를 수정
@app.post("/service-requests", response_model=schemas.ServiceRequest)
async def create_service_request(
    request: schemas.ServiceRequestCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    # 이미 승인된 요청이 있는지 확인
    existing_approved = (
        db.query(models.ServiceRequest)
        .filter(
            models.ServiceRequest.user_id == current_user.id,
            models.ServiceRequest.service_id == request.service_id,
            models.ServiceRequest.status == RequestStatus.APPROVED,
        )
        .first()
    )

    if existing_approved:
        raise HTTPException(status_code=400, detail="이미 승인된 서비스입니다.")

    # 대기 중인 요청이 있는지 확인
    existing_pending = (
        db.query(models.ServiceRequest)
        .filter(
            models.ServiceRequest.user_id == current_user.id,
            models.ServiceRequest.service_id == request.service_id,
            models.ServiceRequest.status == RequestStatus.PENDING,
        )
        .first()
    )

    if existing_pending:
        raise HTTPException(status_code=400, detail="이미 요청된 서비스입니다.")

    # 새 요청 생성
    db_request = models.ServiceRequest(
        user_id=current_user.id, service_id=request.service_id, status=RequestStatus.PENDING
    )
    db.add(db_request)
    db.commit()
    db.refresh(db_request)
    return db_request


# 관리자용: 서비스 요청 목록 조회 (사용자 정보 포함)
@app.get("/service-requests", response_model=List[schemas.ServiceRequestWithDetails])
async def get_service_requests(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    # 모든 요청을 가져오되, 사용자와 서비스 정보도 함께 로드
    requests = (
        db.query(models.ServiceRequest)
        .join(models.User)
        .join(models.Service)
        .order_by(models.ServiceRequest.request_date.desc())
        .all()
    )
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
    return db.query(models.User).all()


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
    return db.query(models.ServiceRequest).filter(models.ServiceRequest.user_id == current_user.id).all()


# 요청 가능한 서비스 목록 조회 수정
@app.get("/available-services", response_model=List[schemas.Service])
async def get_available_services(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    # 관리자는 모든 서비스에 접근 가능
    if current_user.is_admin:
        return db.query(models.Service).all()

    # 현재 사용자의 승인된 서비스와 대기 중인 요청의 서비스 ID 목록
    existing_requests = (
        db.query(models.ServiceRequest.service_id)
        .filter(
            models.ServiceRequest.user_id == current_user.id,
            models.ServiceRequest.status.in_([RequestStatus.APPROVED, RequestStatus.PENDING]),
        )
        .subquery()
    )

    # 아직 요청하지 않은 서비스 목록 반환
    available_services = db.query(models.Service).filter(~models.Service.id.in_(existing_requests)).all()

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


# 서비스에 사용자 추가를 위한 요청 모델
class ServiceUserAdd(BaseModel):
    emails: str  # 쉼표로 구분된 이메일 목록
    showInfo: bool = False  # IP:PORT 정보 공개 여부


# 서비스에 사용자 추가
@app.post("/services/{service_id}/users")
async def add_users_to_service(
    service_id: int,
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
@app.post("/services/{service_id}/users/validate")
async def validate_service_users(
    service_id: int,
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
@app.get("/services/{service_id}/users", response_model=List[schemas.User])
async def get_service_users(
    service_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    # 서비스에 연결된 사용자 목록 반환
    return service.users


# 서비스에 추가 가능한 사용자 목록 조회 API 수정
@app.get("/services/{service_id}/available-users", response_model=List[schemas.User])
async def get_available_users(
    service_id: int,
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
@app.put("/services/{service_id}/users/{user_id}")
async def update_service_user_visibility(
    service_id: int,
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
@app.delete("/services/{service_id}/users/{user_id}")
async def delete_service_user(
    service_id: int,
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
@app.post("/services/upload", response_model=dict)
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
@app.post("/services/bulk", response_model=dict)
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


@app.get("/services/status", response_model=dict)
async def get_services_status(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    try:
        # 모든 서비스의 상태를 확인
        services_status = {}
        services = db.query(models.Service).all()

        for service in services:
            # 관리자는 항상 접근 가능
            if current_user.is_admin:
                status = "available"
            else:
                # 일반 사용자는 승인된 요청이 있는지 확인
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

            # 서비스 연결 상태 확인 (실제 서비스 연결 확인 로직 추가 필요)
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1)  # 1초 타임아웃
                result = sock.connect_ex((service.ip, service.port))
                is_running = result == 0
                sock.close()
            except:
                is_running = False

            services_status[service.id] = {"access": status, "running": "online" if is_running else "offline"}

        return services_status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 승인 대기 중인 사용자 목록 조회
@app.get("/users/pending", response_model=List[schemas.User])
async def get_pending_users(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    return db.query(models.User).filter(models.User.status == models.UserStatus.PENDING).all()


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
