from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import RequestStatus


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
    url: str
    group_id: Optional[str] = None
    group: Optional[ServiceGroup] = None

    class Config:
        orm_mode = True
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


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