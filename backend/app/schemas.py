from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import RequestStatus


class ServiceBase(BaseModel):
    name: str
    protocol: str = "http"
    url: str  # IP:PORT 또는 도메인 주소
    description: Optional[str] = None


class ServiceCreate(BaseModel):
    name: str
    url: str  # IP:PORT 또는 도메인 주소
    protocol: Optional[str] = None  # URL에서 파싱된 프로토콜을 사용
    description: Optional[str] = None
    show_info: bool = False

    class Config:
        schema_extra = {
            "example": {
                "name": "Test Service",
                "url": "https://git.sparklingsoda.ai:8443",
                "description": "테스트 서비스입니다.",
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
