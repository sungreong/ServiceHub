from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status, Request, Response, APIRouter, Form, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import os
import jinja2
from sqlalchemy.exc import IntegrityError
import subprocess
import docker
from docker.errors import NotFound
import time
from fastapi import Header
import uuid

from . import models, schemas, database
from .config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, ALLOWED_DOMAIN

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Nginx 템플릿 수정
NGINX_TEMPLATE = """
location /api/{{ service.id }}/ {
    # JWT 인증 추가
    auth_request /auth;
    auth_request_set $auth_status $upstream_status;

    {% if service.protocol == 'https' %}
    location ~ ^/api/{{ service.id }}/(.*)$ {
        # HTTPS 설정
        proxy_ssl_server_name on;
        proxy_ssl_protocols TLSv1.2 TLSv1.3;
        
        # 서비스 호스트 설정
        proxy_set_header Host {{ service.ip }}:{{ service.port }};
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # URL 경로 유지하면서 프록시
        proxy_pass https://{{ service.ip }}:{{ service.port }}/api/{{ service.id }}/$1$is_args$args;

        # CORS 설정
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' '*' always;

        # 정적 자원 및 API 요청 처리를 위한 설정
        proxy_set_header Accept "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8";
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 버퍼 설정
        proxy_buffers 8 32k;
        proxy_buffer_size 64k;

        # 타임아웃 설정
        proxy_connect_timeout 60;
        proxy_send_timeout 60;
        proxy_read_timeout 60;
    }
    {% else %}
    # HTTP 설정
    proxy_pass http://{{ service.ip }}:{{ service.port }}/;
    proxy_set_header Host {{ service.ip }}:{{ service.port }};
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Content-Type 헤더 추가
    proxy_set_header Accept "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8";
    
    # CORS 설정
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' '*' always;
    
    # 웹소켓 지원
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # 버퍼 설정
    proxy_buffers 8 32k;
    proxy_buffer_size 64k;
    
    # 타임아웃 설정
    proxy_connect_timeout 60;
    proxy_send_timeout 60;
    proxy_read_timeout 60;
    {% endif %}
}

# 인증 실패시 처리
error_page 401 = @error401;

location @error401 {
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization,Content-Type' always;
    return 401;
}
"""

auth_router = APIRouter()  # 라우터 생성


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)  # 기본값 사용
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_user(
    db: Session,
    user: schemas.UserCreate,
    status: models.UserStatus = models.UserStatus.PENDING,
    approval_date: Optional[datetime] = None,
    registration_date: Optional[datetime] = None,
):
    try:
        # 이메일 중복 체크
        existing_user = db.query(models.User).filter(models.User.email == user.email).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="이미 등록된 이메일 주소입니다.")

        hashed_password = get_password_hash(user.password)
        db_user = models.User(
            email=user.email,
            hashed_password=hashed_password,
            is_admin=user.is_admin if hasattr(user, "is_admin") else False,
            status=status,
            registration_date=registration_date or datetime.utcnow(),
            approval_date=approval_date,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="이미 등록된 이메일 주소입니다.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="회원가입 처리 중 오류가 발생했습니다.")


def authenticate_user(db: Session, email: str, password: str):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=404,
            detail={"type": "not_found", "message": "등록되지 않은 이메일입니다. 회원가입을 진행해주세요."},
        )

    if not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=401, detail={"type": "invalid_credentials", "message": "비밀번호가 일치하지 않습니다."}
        )

    if user.status == models.UserStatus.PENDING and not user.is_admin:
        raise HTTPException(
            status_code=403,
            detail={
                "type": "pending_approval",
                "message": "계정이 아직 승인되지 않았습니다.",
                "registration_date": user.registration_date.isoformat(),
            },
        )

    if user.status == models.UserStatus.REJECTED and not user.is_admin:
        raise HTTPException(
            status_code=403, detail={"type": "rejected", "message": "가입이 거절되었습니다. 관리자에게 문의하세요."}
        )

    return user


async def get_current_user(db: Session = Depends(database.get_db), token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    return user


def validate_port(port: int) -> bool:
    """포트 번호의 유효성을 검사합니다."""
    return 1 <= port <= 65535


# def create_service(db: Session, service: schemas.ServiceCreate):
#     """서비스를 생성하고 Nginx 설정을 업데이트합니다."""
#     try:
#         # 포트 유효성 검사
#         if not validate_port(service.port):
#             raise HTTPException(
#                 status_code=400, detail=f"유효하지 않은 포트 번호입니다. (허용 범위: 1-65535, 입력값: {service.port})"
#             )

#         # UUID 생성 (8자리)
#         service_id = str(uuid.uuid4())[:8]

#         # 서비스 데이터 준비
#         service_data = {
#             "id": service_id,
#             "name": service.name,
#             "ip": service.ip,
#             "port": service.port,
#             "description": service.description or "",
#             "show_info": service.show_info,
#             "created_at": datetime.utcnow(),
#         }

#         # 모델 인스턴스 생성 및 저장
#         db_service = models.Service(**service_data)

#         try:
#             db.add(db_service)
#             db.flush()  # 실제 DB 작업을 수행하지만 commit하지는 않음
#         except Exception as e:
#             db.rollback()
#             raise HTTPException(status_code=500, detail=f"서비스 생성 중 오류 발생: {str(e)}")

#         # Nginx 설정 업데이트
#         try:
#             update_nginx_config(db_service)
#         except Exception as e:
#             db.rollback()
#             raise HTTPException(status_code=500, detail=f"Nginx 설정 업데이트 중 오류 발생: {str(e)}")

#         # 모든 작업이 성공하면 commit
#         db.commit()
#         db.refresh(db_service)

#         return {
#             "id": db_service.id,
#             "name": db_service.name,
#             "ip": db_service.ip,
#             "port": db_service.port,
#             "description": db_service.description,
#             "nginx_url": f"/api/{db_service.id}/",
#             "nginxUpdated": True,
#         }

#     except HTTPException as he:
#         raise he
#     except Exception as e:
#         db.rollback()
#         raise HTTPException(status_code=500, detail=f"예기치 않은 오류 발생: {str(e)}")


def get_services(db: Session):
    return db.query(models.Service).all()


def delete_service(db: Session, service_id: int):
    try:
        # 서비스 설정 파일 삭제
        config_file = f"/etc/nginx/services.d/service_{service_id}.conf"
        if os.path.exists(config_file):
            os.remove(config_file)

        # Docker 클라이언트 초기화
        docker_client = docker.from_env()

        # Nginx 컨테이너 찾기
        nginx_container = docker_client.containers.get("nginx")

        # Nginx 설정 테스트
        test_result = nginx_container.exec_run("nginx -t")
        if test_result.exit_code != 0:
            raise Exception(f"Nginx configuration test failed: {test_result.output.decode()}")

        # Nginx 설정 리로드
        reload_result = nginx_container.exec_run("nginx -s reload")
        if reload_result.exit_code != 0:
            raise Exception(f"Nginx reload failed: {reload_result.output.decode()}")

        # DB에서 서비스 삭제
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if service:
            db.delete(service)
            db.commit()
            return True
        else:
            raise Exception("Service not found")

    except Exception as e:
        db.rollback()
        raise Exception(f"Failed to delete service: {str(e)}")


def update_nginx_config(service: models.Service):
    try:
        # Jinja2 템플릿 엔진 설정
        template = jinja2.Template(NGINX_TEMPLATE)

        # 새로운 서비스에 대한 Nginx 설정 생성
        config_content = template.render(service=service)

        # 설정 파일 경로 (services.d 디렉토리 사용)
        config_file = f"/etc/nginx/services.d/service_{service.id}.conf"

        # services.d 디렉토리가 없으면 생성
        os.makedirs(os.path.dirname(config_file), exist_ok=True)

        # 설정 파일 저장
        with open(config_file, "w") as f:
            f.write(config_content)

        # Docker 클라이언트 초기화
        docker_client = docker.from_env()

        # Nginx 컨테이너 찾기
        nginx_container = docker_client.containers.get("nginx")

        # Nginx 설정 테스트
        test_result = nginx_container.exec_run("nginx -t")
        if test_result.exit_code != 0:
            # 설정 파일이 잘못된 경우 삭제
            os.remove(config_file)
            raise Exception(f"Nginx configuration test failed: {test_result.output.decode()}")

        # Nginx 설정 리로드
        reload_result = nginx_container.exec_run("nginx -s reload")
        if reload_result.exit_code != 0:
            # 리로드 실패 시 설정 파일 삭제
            os.remove(config_file)
            raise Exception(f"Nginx reload failed: {reload_result.output.decode()}")

        return True

    except Exception as e:
        # 에러 발생 시 설정 파일이 존재하면 삭제
        if "config_file" in locals() and os.path.exists(config_file):
            os.remove(config_file)
        raise Exception(f"Failed to update nginx config: {str(e)}")


@auth_router.get("/auth")
async def auth_check(
    db: Session = Depends(database.get_db),
    token: str = Header(None, alias="Authorization"),
    cookie_auth: str = Header(None, alias="Cookie"),
):
    # try:
    #     print("[DEBUG] Authorization header:", token)  # 헤더 로깅
    #     print("[DEBUG] Cookie header:", cookie_auth)  # 쿠키 로깅

    #     # 토큰 추출 시도
    #     auth_token = None

    #     # 헤더에서 토큰 확인
    #     if token:
    #         if token.startswith("Bearer "):
    #             auth_token = token.split(" ")[1]
    #     # 쿠키에서 토큰 확인
    #     elif cookie_auth:
    #         cookie_dict = dict(item.split("=") for item in cookie_auth.split("; "))
    #         if "Authorization" in cookie_dict:
    #             auth_value = cookie_dict["Authorization"]
    #             if auth_value.startswith("Bearer "):
    #                 auth_token = auth_value.split(" ")[1]

    #     if not auth_token:
    #         raise HTTPException(
    #             status_code=401,
    #             detail="No authorization token provided",
    #             headers={"WWW-Authenticate": "Bearer"},
    #         )

    #     # 토큰 검증
    #     try:
    #         payload = jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
    #         email: str = payload.get("sub")
    #         if email is None:
    #             raise HTTPException(
    #                 status_code=401,
    #                 detail="Could not validate credentials",
    #                 headers={"WWW-Authenticate": "Bearer"},
    #             )
    #     except JWTError:
    #         raise HTTPException(
    #             status_code=401,
    #             detail="Could not validate credentials",
    #             headers={"WWW-Authenticate": "Bearer"},
    #         )

    #     # 사용자 검증
    #     user = db.query(models.User).filter(models.User.email == email).first()
    #     if user is None:
    #         raise HTTPException(
    #             status_code=401,
    #             detail="User not found",
    #             headers={"WWW-Authenticate": "Bearer"},
    #         )

    #     return {"status": "ok", "email": user.email}

    # except HTTPException as he:
    #     raise he
    # except Exception as e:
    #     print("[ERROR] Auth check failed:", str(e))  # 에러 로깅 추가
    #     raise HTTPException(
    #         status_code=401,
    #         detail="Could not validate credentials",
    #         headers={"WWW-Authenticate": "Bearer"},
    #     )
    pass


@auth_router.get("/verify-token")
async def verify_token(authorization: Optional[str] = Header(None), db: Session = Depends(database.get_db)):
    print("[DEBUG] Authorization header:", authorization)  # 헤더 로깅

    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization token provided")

    try:
        # Bearer 토큰 검증
        if "Bearer" in authorization:
            token = authorization.replace("Bearer ", "")
        else:
            token = authorization

        print("[DEBUG] Token to verify:", token)  # 토큰 로깅

        # 토큰 디코딩
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_email = payload.get("sub")

        print("[DEBUG] Decoded email:", user_email)  # 디코딩된 이메일 로깅

        if not user_email:
            raise HTTPException(status_code=401, detail="Invalid token")

        # DB에서 사용자 조회
        user = db.query(models.User).filter(models.User.email == user_email).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        print("[DEBUG] User found:", user.email, "Is admin:", user.is_admin)  # 사용자 정보 로깅
        return {"status": "ok", "token": token, "user": user_email, "is_admin": user.is_admin}

    except JWTError as e:
        print("[ERROR] JWT verification failed:", str(e))  # JWT 에러 로깅
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        print("[ERROR] Token verification failed:", str(e))  # 기타 에러 로깅
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")


@auth_router.post("/login")
async def login(email: str = Body(...), password: str = Body(...), db: Session = Depends(database.get_db)):
    try:
        # 사용자 조회
        user = db.query(models.User).filter(models.User.email == email).first()

        if not user:
            raise HTTPException(
                status_code=404, detail={"type": "not_found", "message": "등록되지 않은 사용자입니다."}
            )

        # 승인 대기 중인 사용자 체크
        if user.status == models.UserStatus.PENDING:
            raise HTTPException(
                status_code=403,
                detail={
                    "type": "pending_approval",
                    "message": "관리자 승인 대기 중입니다.",
                    "registration_date": user.registration_date.isoformat(),
                },
            )

        # 비밀번호 검증
        if not verify_password(password, user.hashed_password):
            raise HTTPException(status_code=401, detail={"message": "잘못된 비밀번호입니다."})

        # 토큰 생성 시 만료 시간을 24시간으로 설정
        access_token = create_access_token(
            data={"sub": user.email}, expires_delta=timedelta(hours=24)  # 24시간으로 수정
        )

        # 응답에 토큰 정보를 추가
        response = {
            "access_token": access_token,
            "token_type": "bearer",
            "is_admin": user.is_admin,
            "expires_in": 24 * 60 * 60,  # 24시간을 초 단위로
        }

        return response

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail={"message": "로그인 처리 중 오류가 발생했습니다."})
