from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import os
import jinja2
from sqlalchemy.exc import IntegrityError
import subprocess
import docker
from docker.errors import NotFound
import time
from fastapi import Header

from . import models, schemas, database

# JWT 설정을 환경변수에서 가져오도록 수정
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key")  # docker-compose의 환경변수와 일치시킴
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Nginx 템플릿 수정
NGINX_TEMPLATE = """
location /api/{{ service.id }}/ {
    # JWT 인증 추가
    auth_request /auth;
    auth_request_set $auth_status $upstream_status;
    auth_request_set $auth_user $upstream_http_x_user;

    # 인증 실패시 401 리턴
    error_page 401 = @error401;
    
    proxy_pass http://{{ service.ip }}:{{ service.port }}/;
    proxy_set_header Host {{ service.ip }}:{{ service.port }};
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;  # Authorization 헤더 전달
    
    # Content-Type 헤더 추가
    proxy_set_header Accept "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8";
    
    # CORS 설정
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' '*' always;
    
    # OPTIONS 요청 처리 (CORS preflight)
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'Authorization,Content-Type';
        add_header 'Access-Control-Max-Age' 1728000;
        add_header 'Content-Type' 'text/plain charset=UTF-8';
        add_header 'Content-Length' 0;
        return 204;
    }
    
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
}

# 인증 실패시 처리할 location
location @error401 {
    add_header 'Access-Control-Allow-Origin' '*' always;
    return 401 '{"error": "Authentication required"}';
} 
"""


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


def create_service(db: Session, service: schemas.ServiceCreate):
    db_service = models.Service(**service.dict())
    db.add(db_service)
    db.commit()
    db.refresh(db_service)

    # Nginx 설정 업데이트
    update_nginx_config(db_service)

    return {
        "id": db_service.id,
        "name": db_service.name,
        "ip": db_service.ip,
        "port": db_service.port,
        "description": db_service.description,
        "nginx_url": f"/api/{db_service.id}/",
        "nginxUpdated": True,
    }


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
