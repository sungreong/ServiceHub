from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import RequestStatus


class ServiceBase(BaseModel):
    name: str
    ip: str
    port: int
    description: Optional[str] = None


class ServiceCreate(BaseModel):
    name: str
    ip: str
    port: int
    description: Optional[str] = None
    show_info: Optional[bool] = False

    class Config:
        schema_extra = {
            "example": {
                "name": "Test Service",
                "ip": "192.168.1.100",
                "port": 8080,
                "description": "테스트 서비스입니다.",
            }
        }


class ServiceInDB(ServiceCreate):
    id: str
    created_at: datetime

    class Config:
        orm_mode = True


class Service(ServiceBase):
    id: str
    name: str
    ip: str
    port: int
    description: Optional[str] = None
    show_info: bool = False

    class Config:
        orm_mode = True
        schema_extra = {
            "example": {
                "id": "a1b2c3d4",
                "name": "Test Service",
                "ip": "192.168.1.100",
                "port": 8080,
                "description": "테스트 서비스입니다.",
                "show_info": False,
            }
        }


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
    ip: str
    port: int
    description: Optional[str] = None
    show_info: bool = False
    nginxUpdated: bool
    nginx_url: str

    class Config:
        orm_mode = True
