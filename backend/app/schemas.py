from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import RequestStatus


class ServiceBase(BaseModel):
    name: str
    ip: str
    port: int
    description: Optional[str] = None


class ServiceCreate(ServiceBase):
    pass


class Service(BaseModel):
    id: int
    name: str
    ip: str
    port: int
    description: Optional[str] = None
    show_info: bool = False

    class Config:
        orm_mode = True


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
    service_id: int


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
