from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import RequestStatus
from pydantic import validator


# ServiceGroup 스키마 추가
class ServiceGroupBase(BaseModel):
    name: str
    description: Optional[str] = None


class ServiceGroupCreate(ServiceGroupBase):
    pass


class ServiceGroup(ServiceGroupBase):
    id: str
    created_at: datetime

    class Config:
        orm_mode = True


class ServiceBase(BaseModel):
    name: str
    protocol: str = "http"
    url: str  # IP:PORT 또는 도메인 주소
    description: Optional[str] = None
    group_id: Optional[str] = None  # 그룹 ID 필드 추가


class ServiceCreate(BaseModel):
    name: str
    url: str  # IP:PORT 또는 도메인 주소
    protocol: Optional[str] = None  # URL에서 파싱된 프로토콜을 사용
    description: Optional[str] = None
    show_info: bool = False
    group_id: Optional[str] = None  # 그룹 ID 필드 추가

    class Config:
        schema_extra = {
            "example": {
                "name": "Test Service",
                "url": "https://git.sparklingsoda.ai:8443",
                "description": "테스트 서비스입니다.",
                "group_id": "group_1",  # 예시에 그룹 ID 추가
            }
        }


class ServiceInDB(ServiceCreate):
    id: str
    created_at: datetime
    host: str
    port: Optional[int] = None  # port를 선택적으로 변경
    base_path: Optional[str]
    is_ip: bool

    class Config:
        orm_mode = True


class Service(BaseModel):
    id: str
    name: str
    protocol: str
    host: str
    port: Optional[int] = None  # port를 선택적으로 변경
    base_path: Optional[str] = None
    description: Optional[str] = None
    show_info: bool = False
    is_ip: bool = True
    created_at: Optional[datetime] = None
    url: Optional[str] = None
    group_id: Optional[str] = None
    group: Optional[ServiceGroup] = None

    class Config:
        orm_mode = True
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}

    @validator("url", pre=True, always=True)
    def set_url(cls, v, values):
        """url 필드가 없는 경우 기본값 생성"""
        if v is not None:
            return v

        # 필요한 필드가 모두 있는 경우에만 URL 생성 시도
        if all(k in values for k in ("protocol", "host")):
            protocol = values.get("protocol", "http")
            host = values.get("host", "")
            port = values.get("port")
            base_path = values.get("base_path", "")

            if not host:
                return None

            result = f"{protocol}://{host}"
            if port is not None:
                result += f":{port}"
            if base_path:
                if not base_path.startswith("/"):
                    result += "/"
                result += base_path

            return result
        return None


class ServiceWithAccess(Service):
    has_access: bool = False
    request_status: Optional[str] = None


# User 관련 스키마를 먼저 정의
class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    password: str
    is_admin: Optional[bool] = False


class UserUpdate(BaseModel):
    is_admin: Optional[bool] = None
    email: Optional[EmailStr] = None


# ServiceRequest 관련 스키마
class ServiceRequestBase(BaseModel):
    service_id: str


class ServiceRequestCreate(ServiceRequestBase):
    pass


class ServiceRequest(ServiceRequestBase):
    id: int
    user_id: int
    status: str
    request_date: datetime
    response_date: Optional[datetime]
    admin_created: bool
    user_removed: bool

    class Config:
        orm_mode = True


# User와 ServiceRequest를 참조하는 스키마들
class User(UserBase):
    id: int
    is_admin: bool
    status: str
    registration_date: datetime
    approval_date: Optional[datetime] = None
    services: List[Service] = []
    service_requests: List[ServiceRequest] = []

    class Config:
        orm_mode = True


class ServiceRequestWithDetails(ServiceRequest):
    user: User
    service: Service

    class Config:
        orm_mode = True


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ServiceIdsRequest(BaseModel):
    service_ids: List[str]


# 서비스 생성 응답을 위한 새로운 스키마 추가
class ServiceCreateResponse(BaseModel):
    id: str
    name: str
    protocol: str
    url: str
    description: Optional[str] = None
    show_info: bool = False
    nginxUpdated: bool
    nginx_url: str

    class Config:
        orm_mode = True


# 서비스 접속 정보를 위한 스키마
class ServiceAccessBase(BaseModel):
    service_id: Optional[str] = None
    user_id: Optional[int] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    session_id: Optional[str] = None


class ServiceAccessCreate(ServiceAccessBase):
    pass


class ServiceAccess(ServiceAccessBase):
    id: int
    access_time: datetime
    is_active: bool
    last_activity: datetime
    exit_time: Optional[datetime] = None

    class Config:
        orm_mode = True


# 서비스 접속 통계를 위한 스키마
class ServiceAccessStats(BaseModel):
    service_id: str
    service_name: str
    active_users: int
    total_accesses: int

    class Config:
        orm_mode = True


# 전체 접속 통계를 위한 스키마
class AccessStats(BaseModel):
    total_active_users: int
    total_accesses_today: int
    services_stats: List[ServiceAccessStats] = []

    class Config:
        orm_mode = True


# 대기 중인 요청 수 응답 모델
class PendingRequestsCount(BaseModel):
    count: int


# FAQ 관련 스키마
class FaqBase(BaseModel):
    title: str
    content: str
    category: str
    is_published: bool = True
    service_id: Optional[str] = None
    post_type: str = "faq"
    status: Optional[str] = "not_applicable"
    response: Optional[str] = None

    # 서비스 ID 처리 개선
    @validator("service_id", pre=True, always=True)
    def process_service_id(cls, v):
        # v가 None인 경우 명시적으로 None을 반환
        if v is None:
            print("[VALIDATOR:Base] 명시적인 None 값 service_id 처리")
            return None

        # 빈 문자열이나 공백만 있는 경우 None으로 처리
        if v == "" or (isinstance(v, str) and not v.strip()):
            print("[VALIDATOR:Base] 빈 문자열/공백 service_id를 None으로 처리")
            return None

        # 그 외 유효한 값은 그대로 반환
        print(f"[VALIDATOR:Base] 유효한 service_id 처리: {v}")
        return v


class FaqCreate(FaqBase):
    pass


class FaqUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    is_published: Optional[bool] = None
    service_id: Optional[str] = None
    post_type: Optional[str] = None
    status: Optional[str] = None
    response: Optional[str] = None

    # 서비스 ID 처리 개선
    @validator("service_id", pre=True, always=True)
    def process_service_id(cls, v):
        # v가 None인 경우 명시적으로 None을 반환 (이 필드가 요청에 포함되었음을 의미)
        if v is None:
            print("[VALIDATOR] 명시적인 None 값 service_id 처리")
            return None

        # 빈 문자열이나 공백만 있는 경우 None으로 처리
        if v == "" or (isinstance(v, str) and not v.strip()):
            print("[VALIDATOR] 빈 문자열/공백 service_id를 None으로 처리")
            return None

        # 그 외 유효한 값은 그대로 반환
        print(f"[VALIDATOR] 유효한 service_id 처리: {v}")
        return v


class Faq(FaqBase):
    id: str
    created_at: datetime
    updated_at: datetime
    author: Optional[str] = None
    author_id: Optional[str] = None
    service: Optional[Service] = None

    class Config:
        orm_mode = True

    @validator("service", pre=True)
    def validate_service(cls, v):
        if v is None:
            return None
        return v
