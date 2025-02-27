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
from urllib.parse import urlparse
import re
import shutil
import json

from . import models, schemas, database
from .config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, ALLOWED_DOMAIN

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def parse_service_url(url: str):
    """서비스 URL을 파싱하여 프로토콜, 호스트, 포트, 경로를 반환합니다."""
    # URL이 비어있는 경우 기본값 설정
    if not url:
        return {"protocol": "http", "host": "", "port": None, "path": "", "is_ip": False}

    # URL에 프로토콜이 없는 경우 추가
    if not url.startswith(("http://", "https://")):
        url = "http://" + url

    parsed = urlparse(url)
    protocol = parsed.scheme or "http"

    # 호스트와 포트 분리
    netloc = parsed.netloc
    if ":" in netloc:
        host, port_str = netloc.rsplit(":", 1)
        try:
            port = int(port_str)
        except ValueError:
            port = None
    else:
        host = netloc
        port = None  # 포트가 명시되지 않은 경우 None 반환

    # 호스트가 비어있는 경우 처리
    if not host and parsed.path:
        # path에서 첫 번째 부분을 호스트로 사용
        parts = parsed.path.strip("/").split("/", 1)
        host = parts[0]
        path = "/" + parts[1] if len(parts) > 1 else ""
    else:
        path = parsed.path

    # 경로 정규화
    if path and not path.startswith("/"):
        path = "/" + path

    # IP 주소 형식 체크
    ip_pattern = r"^(\d{1,3}\.){3}\d{1,3}$"
    is_ip = bool(re.match(ip_pattern, host))

    print(f"[DEBUG] Parsed URL: protocol={protocol}, host={host}, port={port}, path={path}, is_ip={is_ip}")

    return {"protocol": protocol, "host": host, "port": port, "path": path, "is_ip": is_ip}


HTTP_TEMPLATE = """
# HTTP 서비스 [ID: {{ service.id }}] 설정

# 모든 요청 처리 (단순화된 패턴)
location ~ ^/api/{{ service.id }}/ {
    # 로깅
    access_log /var/log/nginx/service_{{ service.id }}_access.log;
    error_log /var/log/nginx/service_{{ service.id }}_error.log;
    
    # 인증 추가 - 정적 리소스는 인증 건너뛰기
    auth_request /auth;
    auth_request_set $auth_status $upstream_status;
    
    # 경로 재작성 (정적 리소스 패턴 제외)
    rewrite ^/api/{{ service.id }}/(.*)$ /$1 break;
    
    # 프록시 설정
    proxy_pass {% if service.protocol == "https" %}https{% else %}http{% endif %}://{{ service.host }}{% if service.port %}:{{ service.port }}{% endif %};
    proxy_set_header Host {{ service.host }}{% if service.port %}:{{ service.port }}{% endif %};
    
    # 기본 프록시 헤더
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Original-URI $request_uri;
    
    # Streamlit 및 기타 앱을 위한 Content-Type 헤더 추가
    proxy_set_header Accept "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8";
    
    # 웹소켓 지원 추가 (Streamlit 앱에 필요)
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # 버퍼 설정 추가 (대용량 데이터 전송 시 필요)
    proxy_buffers 8 32k;
    proxy_buffer_size 64k;
    
    # 안정적인 프록시 설정
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_connect_timeout 60s;
    
    {% if service.protocol == "https" %}
    # SSL 설정
    proxy_ssl_server_name on;
    proxy_ssl_verify off;
    {% endif %}
    
    # CORS 설정
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
    add_header 'Access-Control-Allow-Headers' '*' always;
    
    # 응답 내용 필터링 - HTML 응답만 처리
    proxy_set_header Accept-Encoding "";
    sub_filter_types text/html text/css application/javascript;
    sub_filter_once off;
    
    # 기본 경로 변환 - 정확한 문자열 패턴으로 변경
    sub_filter 'href="/assets/' 'href="/api/{{ service.id }}/assets/';
    sub_filter 'src="/assets/' 'src="/api/{{ service.id }}/assets/';
    sub_filter 'url("/assets/' 'url("/api/{{ service.id }}/assets/';
    sub_filter 'url(/assets/' 'url(/api/{{ service.id }}/assets/';
    
    sub_filter 'href="/static/' 'href="/api/{{ service.id }}/static/';
    sub_filter 'src="/static/' 'src="/api/{{ service.id }}/static/';
    sub_filter 'url("/static/' 'url("/api/{{ service.id }}/static/';
    sub_filter 'url(/static/' 'url(/api/{{ service.id }}/static/';
    
    sub_filter 'href="/js/' 'href="/api/{{ service.id }}/js/';
    sub_filter 'src="/js/' 'src="/api/{{ service.id }}/js/';
    sub_filter 'url("/js/' 'url("/api/{{ service.id }}/js/';
    sub_filter 'url(/js/' 'url(/api/{{ service.id }}/js/';
    
    sub_filter 'href="/css/' 'href="/api/{{ service.id }}/css/';
    sub_filter 'src="/css/' 'src="/api/{{ service.id }}/css/';
    sub_filter 'url("/css/' 'url("/api/{{ service.id }}/css/';
    sub_filter 'url(/css/' 'url(/api/{{ service.id }}/css/';
    
    sub_filter 'href="/images/' 'href="/api/{{ service.id }}/images/';
    sub_filter 'src="/images/' 'src="/api/{{ service.id }}/images/';
    sub_filter 'url("/images/' 'url("/api/{{ service.id }}/images/';
    sub_filter 'url(/images/' 'url(/api/{{ service.id }}/images/';
    
    # Streamlit 특화 경로 처리
    sub_filter 'href="/_stcore/' 'href="/api/{{ service.id }}/_stcore/';
    sub_filter 'src="/_stcore/' 'src="/api/{{ service.id }}/_stcore/';
    sub_filter 'url("/_stcore/' 'url("/api/{{ service.id }}/_stcore/';
    sub_filter 'url(/_stcore/' 'url(/api/{{ service.id }}/_stcore/';
    
    # 더 일반적인 URL 속성 변환 (/ 로 시작하는 경로만 변환)
    sub_filter 'href="/' 'href="/api/{{ service.id }}/';
    sub_filter 'src="/' 'src="/api/{{ service.id }}/';
    sub_filter 'action="/' 'action="/api/{{ service.id }}/';
    sub_filter 'url("/' 'url("/api/{{ service.id }}/';
    
    # 리다이렉트 처리
    proxy_redirect ~^https?://[^/]+/(.*)$ /api/{{ service.id }}/$1;
}

# CORS 프리플라이트 요청 처리
location ~ ^/api/{{ service.id }}/.*$ {
    if ($request_method = OPTIONS) {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
        add_header 'Access-Control-Allow-Headers' '*' always;
        add_header 'Access-Control-Max-Age' '1728000' always;
        add_header 'Content-Type' 'text/plain charset=UTF-8' always;
        add_header 'Content-Length' '0' always;
        return 204;
    }
    
    # OPTIONS 외 다른 메서드는 기본 핸들러로
    return 404;
}
"""

# HTTPS 서비스용 템플릿
HTTPS_TEMPLATE = """
# HTTPS 서비스 [ID: {{ service.id }}] 설정

# 모든 요청 처리 (단순화된 패턴)
location ~ ^/api/{{ service.id }}/ {
    # 로깅
    access_log /var/log/nginx/service_{{ service.id }}_access.log;
    error_log /var/log/nginx/service_{{ service.id }}_error.log;
    
    # 인증 추가 - 정적 리소스는 인증 건너뛰기
    auth_request /auth;
    auth_request_set $auth_status $upstream_status;
    
    # 경로 재작성 (정적 리소스 패턴 제외)
    rewrite ^/api/{{ service.id }}/(.*)$ /$1 break;
    
    # 프록시 설정
    proxy_pass https://{{ service.host }}{% if service.port %}:{{ service.port }}{% endif %};
    proxy_set_header Host {{ service.host }}{% if service.port %}:{{ service.port }}{% endif %};
    
    # 기본 프록시 헤더
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Original-URI $request_uri;
    
    # Streamlit 및 기타 앱을 위한 Content-Type 헤더 추가
    proxy_set_header Accept "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8";
    
    # 웹소켓 지원 추가 (Streamlit 앱에 필요)
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # 버퍼 설정 추가 (대용량 데이터 전송 시 필요)
    proxy_buffers 8 32k;
    proxy_buffer_size 64k;
    
    # 안정적인 프록시 설정
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_connect_timeout 60s;
    
    # SSL 설정
    proxy_ssl_server_name on;
    proxy_ssl_verify off;
    
    # CORS 설정
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
    add_header 'Access-Control-Allow-Headers' '*' always;
    
    # 응답 내용 필터링 - HTML 응답만 처리
    proxy_set_header Accept-Encoding "";
    sub_filter_types text/html text/css application/javascript;
    sub_filter_once off;
    
    # 기본 경로 변환 - 정확한 문자열 패턴으로 변경
    sub_filter 'href="/assets/' 'href="/api/{{ service.id }}/assets/';
    sub_filter 'src="/assets/' 'src="/api/{{ service.id }}/assets/';
    sub_filter 'url("/assets/' 'url("/api/{{ service.id }}/assets/';
    sub_filter 'url(/assets/' 'url(/api/{{ service.id }}/assets/';
    
    sub_filter 'href="/static/' 'href="/api/{{ service.id }}/static/';
    sub_filter 'src="/static/' 'src="/api/{{ service.id }}/static/';
    sub_filter 'url("/static/' 'url("/api/{{ service.id }}/static/';
    sub_filter 'url(/static/' 'url(/api/{{ service.id }}/static/';
    
    sub_filter 'href="/js/' 'href="/api/{{ service.id }}/js/';
    sub_filter 'src="/js/' 'src="/api/{{ service.id }}/js/';
    sub_filter 'url("/js/' 'url("/api/{{ service.id }}/js/';
    sub_filter 'url(/js/' 'url(/api/{{ service.id }}/js/';
    
    sub_filter 'href="/css/' 'href="/api/{{ service.id }}/css/';
    sub_filter 'src="/css/' 'src="/api/{{ service.id }}/css/';
    sub_filter 'url("/css/' 'url("/api/{{ service.id }}/css/';
    sub_filter 'url(/css/' 'url(/api/{{ service.id }}/css/';
    
    sub_filter 'href="/images/' 'href="/api/{{ service.id }}/images/';
    sub_filter 'src="/images/' 'src="/api/{{ service.id }}/images/';
    sub_filter 'url("/images/' 'url("/api/{{ service.id }}/images/';
    sub_filter 'url(/images/' 'url(/api/{{ service.id }}/images/';
    
    # Streamlit 특화 경로 처리
    sub_filter 'href="/_stcore/' 'href="/api/{{ service.id }}/_stcore/';
    sub_filter 'src="/_stcore/' 'src="/api/{{ service.id }}/_stcore/';
    sub_filter 'url("/_stcore/' 'url("/api/{{ service.id }}/_stcore/';
    sub_filter 'url(/_stcore/' 'url(/api/{{ service.id }}/_stcore/';
    
    # 더 일반적인 URL 속성 변환 (/ 로 시작하는 경로만 변환)
    sub_filter 'href="/' 'href="/api/{{ service.id }}/';
    sub_filter 'src="/' 'src="/api/{{ service.id }}/';
    sub_filter 'action="/' 'action="/api/{{ service.id }}/';
    sub_filter 'url("/' 'url("/api/{{ service.id }}/';
    
    # 리다이렉트 처리
    proxy_redirect ~^https?://[^/]+/(.*)$ /api/{{ service.id }}/$1;
}

# CORS 프리플라이트 요청 처리
location ~ ^/api/{{ service.id }}/.*$ {
    if ($request_method = OPTIONS) {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
        add_header 'Access-Control-Allow-Headers' '*' always;
        add_header 'Access-Control-Max-Age' '1728000' always;
        add_header 'Content-Type' 'text/plain charset=UTF-8' always;
        add_header 'Content-Length' '0' always;
        return 204;
    }
    
    # OPTIONS 외 다른 메서드는 기본 핸들러로
    return 404;
}
"""

# 에러 처리 템플릿 (이 부분은 get_nginx_config 함수에서 더 이상 사용하지 않음)
ERROR_TEMPLATE = """
# 인증 실패시 처리
error_page 401 = @error401;

location @error401 {
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization,Content-Type' always;
    return 401;
}
"""


def get_nginx_config(service):
    """서비스 프로토콜에 따라 적절한 Nginx 설정을 반환합니다."""
    if service.protocol == "https":
        template = HTTPS_TEMPLATE
    else:
        template = HTTP_TEMPLATE

    # Jinja2 템플릿 엔진을 사용하여 설정 생성
    from jinja2 import Template

    config = Template(template).render(service=service)
    return config


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
        print("[DEBUG] Updating Nginx config for service:", service.id)
        print(
            "[DEBUG] Service details:",
            {
                "protocol": service.protocol,
                "host": service.host,
                "port": service.port,
                "base_path": service.base_path,
                "is_ip": service.is_ip,
            },
        )

        # Jinja2 템플릿 엔진 설정
        template = jinja2.Template(get_nginx_config(service))

        # 새로운 서비스에 대한 Nginx 설정 생성
        config_content = template.render(service=service)

        print("[DEBUG] Generated Nginx config:")
        print(config_content)

        # 설정 파일 경로 (services.d 디렉토리 사용)
        config_file = f"/etc/nginx/services.d/service_{service.id}.conf"

        # services.d 디렉토리가 없으면 생성
        os.makedirs(os.path.dirname(config_file), exist_ok=True)

        # 설정 파일 저장
        with open(config_file, "w") as f:
            f.write(config_content)

        print("[DEBUG] Nginx config file created:", config_file)

        # Docker 클라이언트 초기화
        docker_client = docker.from_env()

        # Nginx 컨테이너 찾기
        nginx_container = docker_client.containers.get("nginx")

        # Nginx 설정 테스트
        print("[DEBUG] Testing Nginx configuration...")
        test_result = nginx_container.exec_run("nginx -t")
        if test_result.exit_code != 0:
            error_message = test_result.output.decode()
            print("[ERROR] Nginx configuration test failed:", error_message)
            # 설정 파일이 잘못된 경우 삭제
            os.remove(config_file)
            raise Exception(f"Nginx configuration test failed: {error_message}")

        # Nginx 설정 리로드
        print("[DEBUG] Reloading Nginx configuration...")
        reload_result = nginx_container.exec_run("nginx -s reload")
        if reload_result.exit_code != 0:
            error_message = reload_result.output.decode()
            print("[ERROR] Nginx reload failed:", error_message)
            # 리로드 실패 시 설정 파일 삭제
            os.remove(config_file)
            raise Exception(f"Nginx reload failed: {error_message}")

        print("[DEBUG] Nginx configuration updated successfully")
        return True

    except Exception as e:
        print("[ERROR] Failed to update Nginx config:", str(e))
        # 에러 발생 시 설정 파일이 존재하면 삭제
        if "config_file" in locals() and os.path.exists(config_file):
            os.remove(config_file)
        raise Exception(f"Failed to update nginx config: {str(e)}")


@auth_router.get("/auth")
async def auth_check(
    request: Request,
    db: Session = Depends(database.get_db),
    token: str = Header(None, alias="Authorization"),
    cookie_auth: str = Header(None, alias="Cookie"),
):
    # 요청 URI 확인 (X-Original-URI 헤더에서 가져옴)
    request_uri = request.headers.get("X-Original-URI", "")
    print(f"[DEBUG] 요청 URI: {request_uri}")

    # 모든 헤더 정보 디버깅을 위해 출력
    print(f"[DEBUG] 모든 헤더:")
    for header_name, header_value in request.headers.items():
        print(f"  {header_name}: {header_value}")

    # 정적 리소스 패턴 검사
    static_patterns = [
        "/assets/",
        "/static/",
        "/js/",
        "/css/",
        "/images/",
        "/fonts/",
        "/dist/",
        "/public/",
        "/_stcore/",  # Streamlit 리소스
        "favicon.ico",
        ".js",
        ".css",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".svg",
        ".woff",
        ".woff2",
        ".ttf",
        ".eot",
        ".map",
    ]

    # 로그인 페이지 패턴
    login_patterns = [
        "/login",
        "/register",
        "/users/sign_in",
        "/-/",
    ]

    # 정적 리소스나 로그인 페이지 요청은 인증 없이 통과
    if any(pattern in request_uri for pattern in static_patterns + login_patterns):
        print(f"[DEBUG] 정적 리소스 또는 로그인 페이지 접근 - 인증 건너뜀: {request_uri}")
        return {"status": "ok", "email": "guest@example.com", "resource_type": "static"}

    # JWT 인증 로직 시작
    try:
        print("[DEBUG] Authorization header:", token)  # 헤더 로깅
        print("[DEBUG] Cookie header:", cookie_auth)  # 쿠키 로깅
        print("[DEBUG] Referer:", request.headers.get("Referer", ""))
        print("[DEBUG] Origin:", request.headers.get("Origin", ""))

        # 토큰 추출 시도 - /verify-token 엔드포인트와 같은 방식으로 접근
        auth_token = None

        # 1. 일반 Authorization 헤더에서 토큰 확인
        if token:
            print("[DEBUG] Authorization 헤더 발견")
            if "Bearer" in token:
                auth_token = token.replace("Bearer ", "")
                print(f"[DEBUG] Bearer 토큰 추출: {auth_token[:10] if len(auth_token) > 10 else auth_token}...")
            else:
                auth_token = token
                print(f"[DEBUG] 직접 토큰 추출: {auth_token[:10] if len(auth_token) > 10 else auth_token}...")

        # 2. 다른 인증 관련 헤더 확인
        if not auth_token:
            auth_headers = [
                "X-Auth-Token",
                "X-Access-Token",
                "X-JWT-Token",
                "X-Token",
                "ID-Token",
                "auth",
                "jwt",
            ]

            for header_name in auth_headers:
                header_value = request.headers.get(header_name)
                if header_value:
                    auth_token = header_value
                    print(f"[DEBUG] {header_name} 헤더에서 토큰 추출")
                    break

        # 3. X-Original-URI 또는 Referer에서 URL 쿼리 파라미터로 전달된 토큰 확인
        if not auth_token:
            # X-Original-URI에서 token 파라미터 확인
            if "token=" in request_uri:
                token_match = re.search(r"[?&]token=([^&]+)", request_uri)
                if token_match:
                    auth_token = token_match.group(1)
                    print(f"[DEBUG] URI에서 token 파라미터 추출")

            # Referer에서 token 파라미터 확인
            if not auth_token:
                referer = request.headers.get("Referer", "")
                if "token=" in referer:
                    token_match = re.search(r"[?&]token=([^&]+)", referer)
                    if token_match:
                        auth_token = token_match.group(1)
                        print(f"[DEBUG] Referer에서 token 파라미터 추출")

        # 4. 쿠키에서 토큰 확인 - 다양한 이름으로 시도
        if not auth_token and cookie_auth:
            print("[DEBUG] 쿠키에서 토큰 검색 시도")
            try:
                # 쿠키 파싱
                cookie_dict = {}
                for item in cookie_auth.split("; "):
                    if "=" in item:
                        key, value = item.split("=", 1)
                        cookie_dict[key] = value

                print(f"[DEBUG] 파싱된 쿠키 키: {list(cookie_dict.keys())}")

                # 다양한 쿠키 이름 시도
                cookie_token_names = [
                    "token",
                    "access_token",
                    "jwt",
                    "jwt_token",
                    "Authorization",
                    "auth_token",
                    "id_token",
                    "session_token",
                ]

                for name in cookie_token_names:
                    if name in cookie_dict:
                        auth_token = cookie_dict[name]
                        if auth_token.startswith("Bearer "):
                            auth_token = auth_token.replace("Bearer ", "")
                        print(f"[DEBUG] 쿠키 '{name}'에서 토큰 찾음")
                        break
            except Exception as e:
                print(f"[ERROR] 쿠키 파싱 실패: {str(e)}")

        # 5. 쿠키나 기타 헤더에서 JWT 패턴 직접 찾기
        if not auth_token:
            print("[DEBUG] JWT 패턴 직접 검색 시도")

            # 모든 헤더 값에서 JWT 패턴 검색
            for header_name, header_value in request.headers.items():
                if isinstance(header_value, str) and "eyJ" in header_value:
                    try:
                        auth_match = re.search(r"(eyJ[\w\-]+\.eyJ[\w\-]+\.[\w\-_]+)", header_value)
                        if auth_match:
                            auth_token = auth_match.group(1)
                            print(f"[DEBUG] {header_name} 헤더에서 JWT 패턴 추출")
                            break
                    except Exception as e:
                        print(f"[ERROR] 정규식 패턴 매칭 실패: {str(e)}")

        # 토큰이 없는 경우 인증 실패 처리
        if not auth_token:
            print("[ERROR] 토큰을 찾을 수 없음, 인증 실패")
            # 요청 정보 추가 로깅 (디버깅용)
            req_info = {
                "uri": request_uri,
                "referer": request.headers.get("Referer", ""),
                "origin": request.headers.get("Origin", ""),
                "user_agent": request.headers.get("User-Agent", ""),
            }
            print(f"[ERROR] 인증 실패 상세 정보: {req_info}")

            return Response(
                status_code=401,
                content="인증이 필요합니다. 로그인 후 이용해주세요.",
                headers={
                    "WWW-Authenticate": "Bearer",
                    "X-Auth-Error": "Missing token",
                    "Access-Control-Allow-Origin": "*",
                },
            )

        # 토큰 검증
        try:
            print(f"[DEBUG] 토큰 검증 시도: {auth_token[:10] if len(auth_token) > 10 else auth_token}...")
            payload = jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
            email: str = payload.get("sub")
            user_id: str = payload.get("user_id")  # 토큰에서 user_id 추출

            if email is None:
                print("[ERROR] 토큰에 이메일 없음, 인증 실패")
                return Response(status_code=401, content="유효하지 않은 토큰입니다.")

            # 사용자 DB 확인
            user = db.query(models.User).filter(models.User.email == email).first()
            if not user:
                print(f"[ERROR] 사용자를 찾을 수 없음: {email}")
                return Response(status_code=401, content="등록되지 않은 사용자입니다.")

            # 승인 대기 중인 사용자 체크
            if user.status == models.UserStatus.PENDING and not user.is_admin:
                print(f"[ERROR] 승인 대기 중인 사용자: {email}")
                return Response(status_code=403, content="계정이 아직 승인되지 않았습니다.")

            print(f"[DEBUG] 인증 성공: {email}, 사용자 ID: {user.id}, 관리자 권한: {user.is_admin}")

            # 서비스 접근 권한 확인 (request_uri에서 서비스 ID 추출)
            service_id = None
            if request_uri.startswith("/api/"):
                parts = request_uri.split("/")
                if len(parts) > 2:
                    try:
                        service_id = int(parts[2])
                        print(f"[DEBUG] 요청 서비스 ID: {service_id}")

                        # 서비스 접근 권한 확인
                        service = db.query(models.Service).filter(models.Service.id == service_id).first()
                        if service and not service.is_public:
                            # 비공개 서비스인 경우 접근 권한 확인
                            access_allowed = False

                            # 1. 관리자는 모든 서비스에 접근 가능
                            if user.is_admin:
                                access_allowed = True
                                print(f"[DEBUG] 관리자 권한으로 서비스 접근 허용: {service_id}")
                            else:
                                # 2. 특정 사용자에게 권한이 부여된 경우 확인
                                service_access = (
                                    db.query(models.ServiceAccess)
                                    .filter(
                                        models.ServiceAccess.service_id == service_id,
                                        models.ServiceAccess.user_id == user.id,
                                    )
                                    .first()
                                )

                                if service_access:
                                    access_allowed = True
                                    print(f"[DEBUG] 사용자({user.id})의 서비스({service_id}) 접근 권한 확인")

                                if not access_allowed:
                                    print(f"[ERROR] 서비스 접근 권한 없음: 사용자 {user.id}, 서비스 {service_id}")
                                    return Response(status_code=403, content="이 서비스에 접근할 권한이 없습니다.")
                    except ValueError:
                        # 서비스 ID가 숫자가 아닌 경우
                        pass

            return {"status": "ok", "email": email, "user_id": str(user.id), "is_admin": user.is_admin}

        except JWTError as e:
            print(f"[ERROR] JWT 오류: {str(e)}")
            return Response(status_code=401, content=f"유효하지 않은 인증 토큰입니다: {str(e)}")

    except HTTPException as he:
        print(f"[ERROR] HTTP 예외: {he.detail}")
        raise he
    except Exception as e:
        print(f"[ERROR] 인증 확인 실패: {str(e)}")
        return Response(status_code=500, content=f"인증 확인 중 오류가 발생했습니다: {str(e)}")


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
        # 디버그 로그 추가
        print(f"[DEBUG] 로그인 시도: {email}")
        print(f"[DEBUG] 비밀번호 길이: {len(password)}")

        # 사용자 조회
        user = db.query(models.User).filter(models.User.email == email).first()

        if not user:
            print(f"[ERROR] 등록되지 않은 사용자: {email}")
            raise HTTPException(
                status_code=404, detail={"type": "not_found", "message": "등록되지 않은 사용자입니다."}
            )

        # 승인 대기 중인 사용자 체크
        if user.status == models.UserStatus.PENDING:
            print(f"[ERROR] 승인 대기 중인 사용자: {email}")
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
            print(f"[ERROR] 비밀번호 불일치: {email}")
            raise HTTPException(status_code=401, detail={"message": "잘못된 비밀번호입니다."})

        # 토큰 생성 시 만료 시간을 24시간으로 설정
        access_token = create_access_token(
            data={"sub": user.email, "user_id": user.id}, expires_delta=timedelta(hours=24)  # 사용자 ID 추가
        )

        # 응답에 토큰 정보와 사용자 정보를 추가
        response_data = {
            "access_token": access_token,
            "token_type": "bearer",
            "is_admin": user.is_admin,
            "user_id": user.id,  # 사용자 ID 추가
            "email": user.email,  # 이메일 추가
            "expires_in": 24 * 60 * 60,  # 24시간을 초 단위로
        }

        # 디버그 로그 - 토큰 생성 확인
        print(f"[DEBUG] 토큰 생성 완료: {email}")
        print(f"[DEBUG] 토큰 길이: {len(access_token)}")

        # FastAPI Response 객체 생성
        response = Response(content=json.dumps(response_data), media_type="application/json")

        # 쿠키에 토큰 저장 (httpOnly=False로 설정하여 JavaScript에서도 접근 가능)
        response.set_cookie(
            key="token",
            value=access_token,
            httponly=False,  # JavaScript에서 접근할 수 있도록 설정
            max_age=24 * 60 * 60,  # 24시간
            path="/",
            samesite="lax",  # 크로스 사이트 요청에 대한 보안 설정
        )

        # 사용자 ID 쿠키 추가
        response.set_cookie(
            key="user_id",
            value=str(user.id),
            httponly=False,
            max_age=24 * 60 * 60,
            path="/",
            samesite="lax",
        )

        # 사용자 이메일 쿠키 추가
        response.set_cookie(
            key="user_email",
            value=user.email,
            httponly=False,
            max_age=24 * 60 * 60,
            path="/",
            samesite="lax",
        )

        # 사용자 권한 쿠키 추가
        response.set_cookie(
            key="is_admin",
            value=str(user.is_admin).lower(),
            httponly=False,
            max_age=24 * 60 * 60,
            path="/",
            samesite="lax",
        )

        # 백업 쿠키 추가 (다양한 라이브러리/프레임워크와의 호환성을 위해)
        response.set_cookie(
            key="access_token", value=access_token, httponly=False, max_age=24 * 60 * 60, path="/", samesite="lax"
        )

        print(f"[DEBUG] 로그인 성공 - 토큰 및 사용자 정보 쿠키 설정: {email}")
        return response

    except HTTPException as he:
        print(f"[ERROR] HTTP 예외 발생: {he.detail}")
        raise he
    except Exception as e:
        print(f"[ERROR] 로그인 처리 중 오류: {str(e)}")
        print(f"[ERROR] 예외 타입: {type(e).__name__}")
        import traceback

        print(f"[ERROR] 스택 트레이스: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail={"message": f"로그인 처리 중 오류가 발생했습니다: {str(e)}"})


# 서비스 설정을 생성할 때 사용 예시
def generate_service_config(service):
    nginx_config = get_nginx_config(service)
    # nginx_config를 파일로 저장하거나 필요한 처리를 수행
    return nginx_config


def backup_nginx_config():
    """현재 Nginx 설정을 백업합니다."""
    try:
        nginx_conf_path = "/etc/nginx/conf.d/service_portal.conf"  # Nginx 설정 파일 경로
        backup_path = f"{nginx_conf_path}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        if os.path.exists(nginx_conf_path):
            with open(nginx_conf_path, "r") as f:
                current_config = f.read()

            # 백업 파일 생성
            with open(backup_path, "w") as f:
                f.write(current_config)

            return current_config
    except Exception as e:
        print(f"Nginx 설정 백업 실패: {str(e)}")
        return None


def restore_nginx_config(backup_config: str):
    """백업된 Nginx 설정을 복원합니다."""
    try:
        nginx_conf_path = "/etc/nginx/conf.d/service_portal.conf"

        if backup_config:
            with open(nginx_conf_path, "w") as f:
                f.write(backup_config)

            # Nginx 설정 테스트
            if test_nginx_config():
                reload_nginx()
                return True
    except Exception as e:
        print(f"Nginx 설정 복원 실패: {str(e)}")
    return False


def test_nginx_config():
    """Nginx 설정을 테스트합니다."""
    try:
        result = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
        return result.returncode == 0
    except Exception as e:
        print(f"Nginx 설정 테스트 실패: {str(e)}")
        return False


def reload_nginx():
    """Nginx를 재시작합니다."""
    try:
        subprocess.run(["nginx", "-s", "reload"], check=True)
        return True
    except Exception as e:
        print(f"Nginx 재시작 실패: {str(e)}")
        return False
