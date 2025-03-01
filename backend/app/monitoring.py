from fastapi import FastAPI, Depends, HTTPException, Header, File, UploadFile, APIRouter, status, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from . import models, schemas, database, auth
from typing import List, Optional, Dict, Any, Tuple
from .database import engine, SessionLocal, get_db
from jose import jwt, JWTError
from .config import SECRET_KEY, ALGORITHM, ALLOWED_DOMAIN
from datetime import datetime, timedelta
from .models import RequestStatus, ServiceStatus, Service, ServiceAccess
from pydantic import BaseModel
from sqlalchemy import update, and_, delete, func, desc, or_, text
from .models import user_services  # user_services 테이블 import
import json
import socket
import os
import httpx
import asyncio
import subprocess
from .auth import update_nginx_config  # auth.py의 함수 import
import uuid
import secrets
import random
import math
from .utils.service_checker import check_service_status  # 새로운 서비스 상태 확인 유틸리티 가져오기

# 모니터링 라우터 생성 (services_router와 다른 prefix 사용)
monitoring_router = APIRouter(prefix="/monitoring")

# 서비스 상태 캐시 (메모리에 임시 저장)
service_status_cache: Dict[str, Dict] = {}

# 접속 통계 캐시
access_stats_cache = {
    "last_updated": None,
    "data": None,
    "cache_duration": timedelta(minutes=1),  # 캐시 유효 시간 (1분)
}


# 서비스 접속 통계 조회 API (모니터링 화면에서 사용)
@monitoring_router.get("/services/stats")
async def get_all_services_stats(
    start_date: Optional[str] = None,  # 'YYYY-MM-DD' 형식
    end_date: Optional[str] = None,  # 'YYYY-MM-DD' 형식
    period: str = "today",  # 'today', 'week', 'month', 'year', 'all' 등 사전 정의된 기간
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """모든 서비스의 통계 데이터를 조회합니다."""
    print("Get All Services Stats")
    try:
        # 관리자 권한 체크
        print(current_user.is_admin)
        if not current_user.is_admin:
            raise HTTPException(status_code=403, detail="관리자만 모든 서비스 통계를 조회할 수 있습니다.")

        # 기간 계산
        now = datetime.utcnow()

        if start_date and end_date:
            # 사용자가 직접 기간을 지정한 경우
            try:
                start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
                end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").replace(
                    hour=23, minute=59, second=59, microsecond=999999
                )
                period_name = f"{start_date} ~ {end_date}"
            except ValueError:
                raise HTTPException(
                    status_code=400, detail="날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식을 사용하세요."
                )
        else:
            # 미리 정의된 기간 사용
            if period == "today":
                start_date_obj = now.replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now
                period_name = "오늘"
            elif period == "yesterday":
                start_date_obj = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(microseconds=1)
                period_name = "어제"
            elif period == "week":
                start_date_obj = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now
                period_name = "최근 7일"
            elif period == "month":
                start_date_obj = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now
                period_name = "최근 30일"
            elif period == "year":
                start_date_obj = (now - timedelta(days=365)).replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now
                period_name = "최근 1년"
            elif period == "all":
                # 전체 기간 (첫 기록부터 현재까지)
                first_record = db.query(func.min(models.ServiceAccess.access_time)).scalar()
                start_date_obj = (
                    first_record if first_record else now.replace(hour=0, minute=0, second=0, microsecond=0)
                )
                end_date_obj = now
                period_name = "전체 기간"
            else:
                # 기본값: 오늘
                start_date_obj = now.replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now
                period_name = "오늘"

        print(f"[DEBUG] 조회 기간: {period_name}, 시작: {start_date_obj}, 끝: {end_date_obj}")

        # 전체 활성 사용자 수 (고유 사용자 기준)
        thirty_mins_ago = now - timedelta(minutes=30)
        total_active_users = (
            db.query(func.count(func.distinct(models.ServiceAccess.user_id)))
            .filter(
                (models.ServiceAccess.is_active == True) | (models.ServiceAccess.last_activity >= thirty_mins_ago),
                models.ServiceAccess.user_id != None,
            )
            .scalar()
        ) or 0

        # 해당 기간의 총 접속 수
        total_accesses = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(
                models.ServiceAccess.access_time >= start_date_obj,
                models.ServiceAccess.access_time <= end_date_obj,
            )
            .scalar()
        ) or 0

        # 서비스별 통계
        services_stats = []
        services = db.query(models.Service).all()
        print("Get All Services Stats Services")
        print(services)

        for service in services:
            # 활성 사용자 수 - 개선된 방식으로 계산
            active_users = (
                db.query(func.count(func.distinct(models.ServiceAccess.user_id)))
                .filter(
                    models.ServiceAccess.service_id == service.id,
                    (models.ServiceAccess.is_active == True) | (models.ServiceAccess.last_activity >= thirty_mins_ago),
                    models.ServiceAccess.user_id != None,
                )
                .scalar()
            ) or 0

            # 해당 기간 총 접속 수
            service_accesses = (
                db.query(func.count(models.ServiceAccess.id))
                .filter(
                    models.ServiceAccess.service_id == service.id,
                    models.ServiceAccess.access_time >= start_date_obj,
                    models.ServiceAccess.access_time <= end_date_obj,
                )
                .scalar()
            ) or 0

            # 서비스 상태 확인 - 새로운 유틸리티 사용
            service_status_result = await check_service_status(service)
            status = service_status_result["status"]

            # 마지막 상태 변경 시간
            last_status_change = (
                db.query(models.ServiceStatus.check_time)
                .filter(models.ServiceStatus.service_id == service.id)
                .order_by(models.ServiceStatus.check_time.desc())
                .first()
            )

            last_status_change_time = last_status_change[0] if last_status_change else datetime.utcnow()

            services_stats.append(
                {
                    "service_id": service.id,
                    "service_name": service.name,
                    "active_users": active_users,
                    "total_accesses": service_accesses,  # 해당 기간 접속 수
                    "status": status,
                    "last_status_change": last_status_change_time.strftime("%Y-%m-%d %H:%M"),
                }
            )

        result = {
            "total_active_users": total_active_users,
            "total_accesses": total_accesses,
            "period": period_name,
            "start_date": start_date_obj.strftime("%Y-%m-%d"),
            "end_date": end_date_obj.strftime("%Y-%m-%d"),
            "services_stats": services_stats,
        }

        # 캐시 업데이트
        access_stats_cache["last_updated"] = now
        access_stats_cache["data"] = result
        print("Get All Services Stats Result")
        print(access_stats_cache)
        return result

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[ERROR] 모든 서비스 통계 조회 중 오류: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"서비스 통계 조회 중 오류가 발생했습니다: {str(e)}")


# 특정 서비스 접속 통계 조회 API
@monitoring_router.get("/services/stats/{service_id}")
async def get_service_stats(
    service_id: str,
    start_date: Optional[str] = None,  # 'YYYY-MM-DD' 형식
    end_date: Optional[str] = None,  # 'YYYY-MM-DD' 형식
    period: str = "today",  # 'today', 'week', 'month', 'year', 'all' 등 사전 정의된 기간
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """특정 서비스의 접속 통계를 조회합니다."""
    try:
        # 관리자 권한 체크 (일반 사용자는 자신의 서비스만 조회 가능)
        if current_user and not current_user.is_admin:
            # 서비스에 대한 접근 권한 확인
            user_service = (
                db.query(user_services)
                .filter(user_services.c.service_id == service_id, user_services.c.user_id == current_user.id)
                .first()
            )

            if not user_service:
                raise HTTPException(status_code=403, detail="이 서비스의 통계를 조회할 권한이 없습니다.")

        # 서비스 존재 여부 확인
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다.")

        # 기간 계산
        now = datetime.utcnow()

        if start_date and end_date:
            # 사용자가 직접 기간을 지정한 경우
            try:
                start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
                end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").replace(
                    hour=23, minute=59, second=59, microsecond=999999
                )
                period_name = f"{start_date} ~ {end_date}"
            except ValueError:
                raise HTTPException(
                    status_code=400, detail="날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식을 사용하세요."
                )
        else:
            # 미리 정의된 기간 사용
            if period == "today":
                start_date_obj = now.replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now
                period_name = "오늘"
            elif period == "yesterday":
                start_date_obj = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(microseconds=1)
                period_name = "어제"
            elif period == "week":
                start_date_obj = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now
                period_name = "최근 7일"
            elif period == "month":
                start_date_obj = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now
                period_name = "최근 30일"
            elif period == "year":
                start_date_obj = (now - timedelta(days=365)).replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now
                period_name = "최근 1년"
            elif period == "all":
                # 전체 기간 (첫 기록부터 현재까지)
                first_record = (
                    db.query(func.min(models.ServiceAccess.access_time))
                    .filter(models.ServiceAccess.service_id == service_id)
                    .scalar()
                )
                start_date_obj = (
                    first_record if first_record else now.replace(hour=0, minute=0, second=0, microsecond=0)
                )
                end_date_obj = now
                period_name = "전체 기간"
            else:
                # 기본값: 오늘
                start_date_obj = now.replace(hour=0, minute=0, second=0, microsecond=0)
                end_date_obj = now
                period_name = "오늘"

        print(f"[DEBUG] 조회 기간: {period_name}, 시작: {start_date_obj}, 끝: {end_date_obj}")

        # 해당 기간의 총 접속 수 계산 - 접속(서비스 클릭) 시도한 횟수
        total_accesses = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(
                models.ServiceAccess.service_id == service_id,
                models.ServiceAccess.access_time >= start_date_obj,
                models.ServiceAccess.access_time <= end_date_obj,
            )
            .scalar()
            or 0
        )

        # 개선된 활성 사용자 수 계산 방법
        # 1. 현재 is_active = True인 세션 확인
        # 2. 마지막 활동 시간이 최근 30분 이내인 경우 활성 상태로 간주
        thirty_mins_ago = now - timedelta(minutes=30)

        active_users = (
            db.query(func.count(func.distinct(models.ServiceAccess.user_id)))
            .filter(
                models.ServiceAccess.service_id == service_id,
                models.ServiceAccess.user_id.isnot(None),
                (models.ServiceAccess.is_active == True) | (models.ServiceAccess.last_activity >= thirty_mins_ago),
            )
            .scalar()
            or 0
        )

        # 고유 사용자 수 계산 (기간 내 접속한 고유 사용자)
        unique_users = (
            db.query(func.count(func.distinct(models.ServiceAccess.user_id)))
            .filter(
                models.ServiceAccess.service_id == service_id,
                models.ServiceAccess.access_time >= start_date_obj,
                models.ServiceAccess.access_time <= end_date_obj,
                models.ServiceAccess.user_id.isnot(None),
            )
            .scalar()
            or 0
        )

        # 시간별 접속 통계 개선
        hourly_stats = []

        # 기간이 7일 이내인 경우 시간별 통계 제공
        if (end_date_obj - start_date_obj).days <= 7:
            # 시작일부터 종료일까지 하루씩 반복
            current_date = start_date_obj
            while current_date <= end_date_obj:
                date_str = current_date.strftime("%Y-%m-%d")
                day_start = current_date.replace(hour=0, minute=0, second=0, microsecond=0)

                # 해당 날짜의 모든 접속 여부 확인 (쿼리 최소화)
                day_has_accesses = (
                    db.query(models.ServiceAccess.id)
                    .filter(
                        models.ServiceAccess.service_id == service_id,
                        models.ServiceAccess.access_time >= day_start,
                        models.ServiceAccess.access_time < day_start + timedelta(days=1),
                    )
                    .first()
                    is not None
                )

                # 데이터가 있는 날짜만 시간별 통계 계산
                if day_has_accesses or current_date.date() == now.date():  # 오늘은 항상 표시
                    for hour in range(24):
                        # 미래 시간은 제외
                        if current_date.date() == now.date() and hour > now.hour:
                            continue

                        hour_start = day_start.replace(hour=hour)
                        hour_end = hour_start + timedelta(hours=1)

                        # 종료일 이후는 계산하지 않음
                        if hour_start > end_date_obj:
                            break

                        # 접속 수 계산 - 접속 시도 횟수 (중복 허용)
                        hour_accesses = (
                            db.query(func.count(models.ServiceAccess.id))
                            .filter(
                                models.ServiceAccess.service_id == service_id,
                                models.ServiceAccess.access_time >= hour_start,
                                models.ServiceAccess.access_time < hour_end,
                            )
                            .scalar()
                            or 0
                        )

                        # 고유 사용자 수 계산 (시간대별)
                        hour_unique_users = (
                            db.query(func.count(func.distinct(models.ServiceAccess.user_id)))
                            .filter(
                                models.ServiceAccess.service_id == service_id,
                                models.ServiceAccess.access_time >= hour_start,
                                models.ServiceAccess.access_time < hour_end,
                                models.ServiceAccess.user_id.isnot(None),
                            )
                            .scalar()
                            or 0
                        )

                        # 데이터가 있거나 오늘 날짜의 경우만 추가
                        if hour_accesses > 0 or current_date.date() == now.date():
                            hourly_stats.append(
                                {
                                    "date": date_str,
                                    "hour": f"{hour:02d}:00",
                                    "datetime": f"{date_str} {hour:02d}:00",
                                    "count": hour_accesses,
                                    "unique_users": hour_unique_users,
                                }
                            )

                current_date += timedelta(days=1)
        else:
            # 기간이 7일을 초과하는 경우, 일자별 통계 제공
            current_date = start_date_obj
            while current_date <= end_date_obj:
                date_str = current_date.strftime("%Y-%m-%d")
                day_start = current_date.replace(hour=0, minute=0, second=0, microsecond=0)
                day_end = day_start + timedelta(days=1)

                # 종료일 이후는 계산하지 않음
                if day_start > end_date_obj:
                    break

                # 접속 횟수 (중복 허용)
                day_accesses = (
                    db.query(func.count(models.ServiceAccess.id))
                    .filter(
                        models.ServiceAccess.service_id == service_id,
                        models.ServiceAccess.access_time >= day_start,
                        models.ServiceAccess.access_time < day_end,
                    )
                    .scalar()
                    or 0
                )

                # 고유 사용자 수 (일자별)
                day_unique_users = (
                    db.query(func.count(func.distinct(models.ServiceAccess.user_id)))
                    .filter(
                        models.ServiceAccess.service_id == service_id,
                        models.ServiceAccess.access_time >= day_start,
                        models.ServiceAccess.access_time < day_end,
                        models.ServiceAccess.user_id.isnot(None),
                    )
                    .scalar()
                    or 0
                )

                # 접속이 있었거나 최근 7일 데이터인 경우만 추가
                if day_accesses > 0 or (now - day_start).days < 7:
                    hourly_stats.append(
                        {
                            "date": date_str,
                            "hour": "all",
                            "datetime": date_str,
                            "count": day_accesses,
                            "unique_users": day_unique_users,
                        }
                    )

                current_date += timedelta(days=1)

        # 서비스 상태 확인 - 새로운 유틸리티 사용
        service_status_result = await check_service_status(service)
        service_status = service_status_result["status"]

        # 마지막 상태 변경 시간
        last_status_change = (
            db.query(models.ServiceStatus.check_time)
            .filter(models.ServiceStatus.service_id == service_id)
            .order_by(models.ServiceStatus.check_time.desc())
            .first()
        )

        last_status_change_time = last_status_change[0] if last_status_change else datetime.utcnow()

        return {
            "service_id": service_id,
            "service_name": service.name,
            "active_users": active_users,
            "unique_users": unique_users,
            "total_accesses": total_accesses,
            "period": period_name,
            "start_date": start_date_obj.strftime("%Y-%m-%d"),
            "end_date": end_date_obj.strftime("%Y-%m-%d"),
            "status": service_status,
            "last_status_change": last_status_change_time.strftime("%Y-%m-%d %H:%M"),
            "hourly_stats": hourly_stats,
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[ERROR] 서비스 통계 조회 중 오류: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"서비스 통계 조회 중 오류가 발생했습니다: {str(e)}")


# 서비스 상세 모니터링 데이터 조회 API
@monitoring_router.get("/services/monitoring/{service_id}")
async def get_service_monitoring_data(
    service_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """서비스의 상세 모니터링 데이터를 조회합니다."""
    try:
        # 관리자 권한 체크 (일반 사용자는 자신의 서비스만 조회 가능)
        if current_user and not current_user.is_admin:
            # 서비스에 대한 접근 권한 확인
            user_service = (
                db.query(user_services)
                .filter(user_services.c.service_id == service_id, user_services.c.user_id == current_user.id)
                .first()
            )

            if not user_service:
                raise HTTPException(status_code=403, detail="이 서비스의 모니터링 데이터를 조회할 권한이 없습니다.")

        # 서비스 존재 여부 확인
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다.")

        # 24시간 타임스탬프 생성
        timestamps = []
        for i in range(24):
            hour = datetime.utcnow().replace(minute=0, second=0, microsecond=0) - timedelta(hours=24 - i)
            timestamps.append(hour.strftime("%Y-%m-%d %H:%M"))

        # 서비스 상태 확인 - 새로운 유틸리티 사용
        service_status_result = await check_service_status(service)
        service_status = service_status_result["status"]

        # 마지막 상태 변경 시간
        last_status_change = (
            db.query(models.ServiceStatus.check_time)
            .filter(models.ServiceStatus.service_id == service_id)
            .order_by(models.ServiceStatus.check_time.desc())
            .first()
        )

        last_status_change_time = last_status_change[0] if last_status_change else datetime.utcnow()

        # 시간별 접속 통계 데이터 가져오기
        hourly_data = []
        today = datetime.utcnow().date()

        for i in range(24):
            hour_start = datetime.combine(today, datetime.min.time().replace(hour=i))
            hour_end = hour_start + timedelta(hours=1)

            count = (
                db.query(func.count(models.ServiceAccess.id))
                .filter(
                    models.ServiceAccess.service_id == service_id,
                    models.ServiceAccess.access_time >= hour_start,
                    models.ServiceAccess.access_time < hour_end,
                )
                .scalar()
            ) or 0

            hourly_data.append(count)

        # 최근 로그 항목 생성 (실제로는 데이터베이스에서 가져와야 함)
        recent_logs = []

        # 실제 로그가 있는지 확인 (여기서는 서비스 접근 기록을 활용)
        service_accesses = (
            db.query(models.ServiceAccess)
            .filter(models.ServiceAccess.service_id == service_id)
            .order_by(models.ServiceAccess.access_time.desc())
            .limit(10)
            .all()
        )

        # 로그 메시지 템플릿
        log_templates = {
            "start": "서비스 접속 시작: 사용자 ID {}",
            "heartbeat": "하트비트 수신: 세션 {}",
            "end": "서비스 접속 종료: 세션 {}",
            "error": "오류 발생: {}",
        }

        # 실제 접근 로그를 기반으로 한 로그 생성
        for access in service_accesses:
            log_type = "INFO"

            if not access.is_active and access.end_time:
                message = log_templates["end"].format(access.session_id)
            elif access.last_activity and access.last_activity > access.access_time:
                message = log_templates["heartbeat"].format(access.session_id)
            else:
                message = log_templates["start"].format(access.user_id or "익명")

            recent_logs.append(
                {
                    "timestamp": access.access_time.strftime("%Y-%m-%d %H:%M:%S"),
                    "level": log_type,
                    "message": message,
                    "service_id": service_id,
                }
            )

        # 타임스탬프 기준으로 정렬
        recent_logs.sort(key=lambda x: x["timestamp"], reverse=True)

        # 서비스가 멈춰있을 경우 에러 로그 추가
        if service_status == "stopped":
            recent_logs.insert(
                0,
                {
                    "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                    "level": "ERROR",
                    "message": "서비스가 응답하지 않음",
                    "service_id": service_id,
                },
            )

        return {
            "cpu": [0] * 24,  # 실제 CPU 데이터 대신 빈 배열
            "memory": [0] * 24,  # 실제 메모리 데이터 대신 빈 배열
            "requests": hourly_data,  # 시간별 요청 수
            "errors": [0] * 24,  # 실제 오류 데이터 대신 빈 배열
            "responseTime": [0] * 24,  # 실제 응답 시간 데이터 대신 빈 배열
            "timestamps": timestamps,
            "status": {
                "current": service_status,
                "last_changed": last_status_change_time.strftime("%Y-%m-%d %H:%M"),
                "uptime_percentage": 100 if service_status == "running" else 0,
            },
            "recent_logs": recent_logs,
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"서비스 모니터링 데이터 조회 중 오류가 발생했습니다: {str(e)}")


# 전체 사용자 접속 통계 API
@monitoring_router.get("/users/stats")
async def get_user_access_stats(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """사용자별 접속 통계를 조회합니다. 관리자만 접근 가능합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다.")

    # 오늘 날짜 기준
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # 사용자별 통계 계산
    user_stats = []
    users = db.query(models.User).all()

    for user in users:
        # 현재 활성 세션 수
        active_sessions = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(models.ServiceAccess.user_id == user.id, models.ServiceAccess.is_active == True)
            .scalar()
            or 0
        )

        # 오늘 총 접속 수
        today_accesses = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(models.ServiceAccess.user_id == user.id, models.ServiceAccess.access_time >= today_start)
            .scalar()
            or 0
        )

        # 전체 접속 수
        total_accesses = (
            db.query(func.count(models.ServiceAccess.id)).filter(models.ServiceAccess.user_id == user.id).scalar() or 0
        )

        # 마지막 접속 시간
        last_access = (
            db.query(models.ServiceAccess.access_time)
            .filter(models.ServiceAccess.user_id == user.id)
            .order_by(models.ServiceAccess.access_time.desc())
            .first()
        )

        last_access_time = last_access[0] if last_access else None

        user_stats.append(
            {
                "user_id": user.id,
                "email": user.email,
                "is_admin": user.is_admin,
                "active_sessions": active_sessions,
                "today_accesses": today_accesses,
                "total_accesses": total_accesses,
                "last_access": last_access_time.strftime("%Y-%m-%d %H:%M:%S") if last_access_time else None,
            }
        )

    return user_stats


@monitoring_router.get("/statistics/daily")
async def get_daily_access_stats(
    days: int = 7,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """일별 접속 통계를 조회합니다. 관리자만 접근 가능합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다.")

    # 날짜별 통계 계산
    daily_stats = []

    for day in range(days):
        day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=day)
        day_end = day_start + timedelta(days=1)

        # 해당 일자의 총 접속 수
        total_accesses = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(models.ServiceAccess.access_time >= day_start, models.ServiceAccess.access_time < day_end)
            .scalar()
            or 0
        )

        # 해당 일자의 고유 사용자 수
        unique_users = (
            db.query(func.count(func.distinct(models.ServiceAccess.user_id)))
            .filter(
                models.ServiceAccess.access_time >= day_start,
                models.ServiceAccess.access_time < day_end,
                models.ServiceAccess.user_id != None,
            )
            .scalar()
            or 0
        )

        # 서비스별 접속 통계
        service_stats = []
        services = db.query(models.Service).all()

        for service in services:
            service_accesses = (
                db.query(func.count(models.ServiceAccess.id))
                .filter(
                    models.ServiceAccess.service_id == service.id,
                    models.ServiceAccess.access_time >= day_start,
                    models.ServiceAccess.access_time < day_end,
                )
                .scalar()
                or 0
            )

            if service_accesses > 0:
                service_stats.append(
                    {"service_id": service.id, "service_name": service.name, "accesses": service_accesses}
                )

        daily_stats.append(
            {
                "date": day_start.strftime("%Y-%m-%d"),
                "total_accesses": total_accesses,
                "unique_users": unique_users,
                "service_stats": service_stats,
            }
        )

    return daily_stats


@monitoring_router.get("/user/{user_id}/stats")
async def get_specific_user_stats(
    user_id: int,
    days: int = 7,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """특정 사용자의 접속 통계를 조회합니다. 관리자만 접근 가능합니다."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다.")

    # 사용자 존재 여부 확인
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    # 기본 사용자 정보
    user_info = {"user_id": user.id, "email": user.email, "is_admin": user.is_admin}

    # 일별 접속 통계
    daily_stats = []

    for day in range(days):
        day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=day)
        day_end = day_start + timedelta(days=1)

        # 해당 일자의 총 접속 수
        total_accesses = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(
                models.ServiceAccess.user_id == user_id,
                models.ServiceAccess.access_time >= day_start,
                models.ServiceAccess.access_time < day_end,
            )
            .scalar()
        ) or 0

        # 서비스별 접속 통계
        service_stats = []

        # 사용자가 접근한 서비스 목록
        accessed_services = (
            db.query(models.Service)
            .join(models.ServiceAccess)
            .filter(
                models.ServiceAccess.user_id == user_id,
                models.ServiceAccess.access_time >= day_start,
                models.ServiceAccess.access_time < day_end,
            )
            .distinct()
            .all()
        )

        for service in accessed_services:
            service_accesses = (
                db.query(func.count(models.ServiceAccess.id))
                .filter(
                    models.ServiceAccess.user_id == user_id,
                    models.ServiceAccess.service_id == service.id,
                    models.ServiceAccess.access_time >= day_start,
                    models.ServiceAccess.access_time < day_end,
                )
                .scalar()
            ) or 0

            service_stats.append(
                {"service_id": service.id, "service_name": service.name, "accesses": service_accesses}
            )

        daily_stats.append(
            {"date": day_start.strftime("%Y-%m-%d"), "total_accesses": total_accesses, "service_stats": service_stats}
        )

    # 접속 시간대별 통계 (24시간)
    hourly_stats = []

    for hour in range(24):
        hour_accesses = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(
                models.ServiceAccess.user_id == user_id, func.extract("hour", models.ServiceAccess.access_time) == hour
            )
            .scalar()
        ) or 0

        hourly_stats.append({"hour": hour, "accesses": hour_accesses})

    return {"user_info": user_info, "daily_stats": daily_stats, "hourly_stats": hourly_stats}


# 사용자 서비스 모니터링 엔드포인트 추가
# @monitoring_router.get("/user/services/stats", response_model=Dict)
# async def get_user_services_stats(
#     db: Session = Depends(get_db),
#     current_user: models.User = Depends(auth.get_current_user),
# ):
#     """현재 로그인한 사용자가 접근 가능한 서비스 목록과 기본 통계를 조회합니다."""
#     try:
#         print("서비스 정보 조회")
#         # 사용자가 접근 가능한 서비스 목록 조회
#         if current_user.is_admin:
#             # 관리자는 모든 서비스에 접근 가능
#             services = db.query(models.Service).all()
#         else:
#             # 일반 사용자는 권한이 있는 서비스만 접근 가능
#             services = (
#                 db.query(models.Service)
#                 .join(models.user_services, models.Service.id == models.user_services.c.service_id)
#                 .filter(models.user_services.c.user_id == current_user.id)
#                 .all()
#             )

#         # 현재 시간 설정
#         now = datetime.utcnow()
#         today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

#         # 일주일 전 시간 설정 (period_days용)
#         week_ago = now - timedelta(days=7)

#         # 서비스별 통계 정보 추가
#         services_stats = []
#         total_accesses = 0

#         for service in services:
#             try:
#                 # 서비스 상태 확인
#                 service_status_result = await check_service_status(service)
#                 status = service_status_result.get("status", "unknown")
#             except Exception as e:
#                 print(f"[ERROR] 서비스 상태 확인 중 오류: {str(e)}")
#                 status = "error"

#             # 오늘 접속 횟수
#             today_accesses = (
#                 db.query(func.count(models.ServiceAccess.id))
#                 .filter(
#                     models.ServiceAccess.service_id == service.id,
#                     models.ServiceAccess.user_id == current_user.id,
#                     models.ServiceAccess.access_time >= today_start,
#                 )
#                 .scalar()
#             ) or 0

#             # 전체 접속 횟수
#             service_total_accesses = (
#                 db.query(func.count(models.ServiceAccess.id))
#                 .filter(models.ServiceAccess.service_id == service.id, models.ServiceAccess.user_id == current_user.id)
#                 .scalar()
#             ) or 0

#             # 기간별(7일) 접속 횟수
#             period_accesses = (
#                 db.query(func.count(models.ServiceAccess.id))
#                 .filter(
#                     models.ServiceAccess.service_id == service.id,
#                     models.ServiceAccess.user_id == current_user.id,
#                     models.ServiceAccess.access_time >= week_ago,
#                 )
#                 .scalar()
#             ) or 0

#             # 마지막 접속 시간
#             last_access = (
#                 db.query(models.ServiceAccess.access_time)
#                 .filter(models.ServiceAccess.service_id == service.id, models.ServiceAccess.user_id == current_user.id)
#                 .order_by(models.ServiceAccess.access_time.desc())
#                 .first()
#             )

#             last_access_time = last_access[0] if last_access else None

#             # 현재 활성 세션 여부
#             active_sessions = (
#                 db.query(func.count(models.ServiceAccess.id))
#                 .filter(
#                     models.ServiceAccess.service_id == service.id,
#                     models.ServiceAccess.user_id == current_user.id,
#                     models.ServiceAccess.is_active == True,
#                 )
#                 .scalar()
#             ) or 0

#             # 현재 활성 사용자 수 (동시 접속자 수)
#             concurrent_users = (
#                 db.query(func.count(func.distinct(models.ServiceAccess.user_id)))
#                 .filter(
#                     models.ServiceAccess.service_id == service.id,
#                     models.ServiceAccess.is_active == True,
#                 )
#                 .scalar()
#             ) or 0

#             # 전체 활성 사용자 수
#             total_active_users = (
#                 db.query(func.count(func.distinct(models.ServiceAccess.user_id)))
#                 .filter(models.ServiceAccess.service_id == service.id)
#                 .scalar()
#             ) or 0

#             total_accesses += service_total_accesses

#             services_stats.append(
#                 {
#                     "service_id": service.id,
#                     "service_name": service.name,
#                     "description": service.description,
#                     "status": status,
#                     "today_accesses": today_accesses,
#                     "total_accesses": service_total_accesses,
#                     "period_accesses": period_accesses,
#                     "active_sessions": active_sessions,
#                     "concurrent_users": concurrent_users,
#                     "total_active_users": total_active_users,
#                     "last_access": last_access_time.strftime("%Y-%m-%d %H:%M:%S") if last_access_time else None,
#                     "has_active_session": active_sessions > 0,
#                     "url": service.full_url if hasattr(service, "full_url") else service.url,
#                     "icon": service.icon if hasattr(service, "icon") else None,
#                 }
#             )

#         return {
#             "user_email": current_user.email,
#             "user_id": current_user.id,
#             "total_services": len(services_stats),
#             "total_accesses": total_accesses,
#             "period_days": 7,
#             "services_stats": services_stats,
#         }

#     except Exception as e:
#         print(f"[ERROR] 사용자 서비스 목록 조회 중 오류: {str(e)}")
#         import traceback

#         traceback.print_exc()
#         raise HTTPException(status_code=500, detail=f"사용자 서비스 목록 조회 중 오류가 발생했습니다: {str(e)}")


# @monitoring_router.get("/user/services/stats", response_model=Dict)
# async def get_sample(
#     current_user: models.User = Depends(auth.get_current_user),
#     db: Session = Depends(get_db),
# ):
#     return {
#         "user_email": "test@test.com",
#         "user_id": 1,
#         "total_services": 1,
#         "total_accesses": 1,
#         "period_days": 7,
#         "services_stats": [],
#     }


@monitoring_router.get("/user/services/{service_id}/detail")
async def get_user_service_detail_stats(
    service_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """현재 로그인한 사용자의 특정 서비스 상세 통계를 조회합니다."""
    try:
        print(f"[DEBUG] 사용자({current_user.email}) 서비스({service_id}) 상세 통계 조회 시작")

        # 서비스 존재 여부 확인
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다.")

        # 서비스 접근 권한 확인 (관리자 제외)
        if not current_user.is_admin:
            user_service = (
                db.query(models.user_services)
                .filter(
                    models.user_services.c.service_id == service_id, models.user_services.c.user_id == current_user.id
                )
                .first()
            )

            if not user_service:
                raise HTTPException(status_code=403, detail="이 서비스에 접근할 권한이 없습니다.")

        # 현재 시간 및 기간 설정 (최근 7일)
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        period_start = today_start - timedelta(days=6)  # 7일(오늘 포함)

        # 활성 사용자 기준 시간 (30분)
        thirty_mins_ago = now - timedelta(minutes=30)

        # 서비스 상태 확인
        service_status_result = await check_service_status(service)

        # 서비스 접속 로그 조회
        service_logs = (
            db.query(models.ServiceAccess)
            .filter(
                models.ServiceAccess.service_id == service_id,
                models.ServiceAccess.user_id == current_user.id,
                models.ServiceAccess.access_time >= period_start,
            )
            .order_by(models.ServiceAccess.access_time.desc())
            .limit(50)  # 최대 50개 로그만 반환
            .all()
        )

        formatted_logs = []
        for log in service_logs:
            log_type = "접속"
            if log.end_time:
                log_type = "종료"
            elif log.last_activity and log.last_activity > log.access_time:
                log_type = "활동"

            formatted_logs.append(
                {
                    "timestamp": log.access_time.strftime("%Y-%m-%d %H:%M:%S"),
                    "type": log_type,
                    "session_id": log.session_id,
                    "is_active": log.is_active,
                    "access_id": log.id,
                }
            )

        # 일별 접속 통계
        daily_stats = []
        for day in range(7):
            day_start = today_start - timedelta(days=day)
            day_end = day_start + timedelta(days=1)

            # 하루 동안의 시간대별 통계
            hourly_stats = []
            for hour in range(24):
                hour_start = day_start.replace(hour=hour)
                hour_end = hour_start + timedelta(hours=1)

                hour_accesses = (
                    db.query(func.count(models.ServiceAccess.id))
                    .filter(
                        models.ServiceAccess.service_id == service_id,
                        models.ServiceAccess.user_id == current_user.id,
                        models.ServiceAccess.access_time >= hour_start,
                        models.ServiceAccess.access_time < hour_end,
                    )
                    .scalar()
                ) or 0

                if hour_accesses > 0:
                    hourly_stats.append({"hour": hour, "formatted_hour": f"{hour:02d}:00", "accesses": hour_accesses})

            # 일별 총 접속 수 계산
            day_accesses = (
                db.query(func.count(models.ServiceAccess.id))
                .filter(
                    models.ServiceAccess.service_id == service_id,
                    models.ServiceAccess.user_id == current_user.id,
                    models.ServiceAccess.access_time >= day_start,
                    models.ServiceAccess.access_time < day_end,
                )
                .scalar()
            ) or 0

            # 접속 기록이 있는 날짜만 추가
            if day_accesses > 0:
                daily_stats.append(
                    {
                        "date": day_start.strftime("%Y-%m-%d"),
                        "day_of_week": day_start.strftime("%A"),
                        "total_accesses": day_accesses,
                        "hourly_stats": sorted(hourly_stats, key=lambda x: x["hour"]),
                    }
                )

        # 전체 통계 정보
        total_accesses = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(models.ServiceAccess.service_id == service_id, models.ServiceAccess.user_id == current_user.id)
            .scalar()
        ) or 0

        today_accesses = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(
                models.ServiceAccess.service_id == service_id,
                models.ServiceAccess.user_id == current_user.id,
                models.ServiceAccess.access_time >= today_start,
            )
            .scalar()
        ) or 0

        period_accesses = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(
                models.ServiceAccess.service_id == service_id,
                models.ServiceAccess.user_id == current_user.id,
                models.ServiceAccess.access_time >= period_start,
            )
            .scalar()
        ) or 0

        # 활성 세션 수
        active_sessions_count = (
            db.query(func.count(models.ServiceAccess.id))
            .filter(
                models.ServiceAccess.service_id == service_id,
                models.ServiceAccess.user_id == current_user.id,
                models.ServiceAccess.is_active == True,
            )
            .scalar()
        ) or 0

        # 전체 활성 사용자 수 (모든 사용자)
        concurrent_users = (
            db.query(func.count(func.distinct(models.ServiceAccess.user_id)))
            .filter(
                models.ServiceAccess.service_id == service_id,
                models.ServiceAccess.user_id.isnot(None),
                (models.ServiceAccess.is_active == True) | (models.ServiceAccess.last_activity >= thirty_mins_ago),
            )
            .scalar()
        ) or 0

        # 다른 활성 사용자 목록 조회 (현재 사용자 제외, 최대 5명)
        other_active_users = (
            db.query(models.User.email)
            .join(
                models.ServiceAccess,
                and_(
                    models.ServiceAccess.user_id == models.User.id,
                    models.ServiceAccess.service_id == service_id,
                    (models.ServiceAccess.is_active == True) | (models.ServiceAccess.last_activity >= thirty_mins_ago),
                ),
            )
            .filter(models.User.id != current_user.id)
            .distinct()
            .limit(5)  # 최대 5명까지만 표시
            .all()
        )

        other_active_users_emails = [u[0].split("@")[0] for u in other_active_users]  # 이메일에서 이름 부분만 추출

        # 첫 접속 시간
        first_access = (
            db.query(models.ServiceAccess.access_time)
            .filter(models.ServiceAccess.service_id == service_id, models.ServiceAccess.user_id == current_user.id)
            .order_by(models.ServiceAccess.access_time.asc())
            .first()
        )

        first_access_time = first_access[0].strftime("%Y-%m-%d %H:%M:%S") if first_access else None

        # 마지막 접속 시간
        last_access = (
            db.query(models.ServiceAccess.access_time)
            .filter(models.ServiceAccess.service_id == service_id, models.ServiceAccess.user_id == current_user.id)
            .order_by(models.ServiceAccess.access_time.desc())
            .first()
        )

        last_access_time = last_access[0].strftime("%Y-%m-%d %H:%M:%S") if last_access else None

        return {
            "service_id": service_id,
            "service_name": service.name,
            "status": service_status_result["status"],
            "status_details": service_status_result["details"],
            "user_email": current_user.email,
            "total_stats": {
                "all_time_accesses": total_accesses,
                "today_accesses": today_accesses,
                "period_accesses": period_accesses,
                "active_sessions": active_sessions_count,
                "first_access": first_access_time,
                "last_access": last_access_time,
                "concurrent_users": concurrent_users,  # 전체 동시 접속자 수
                "other_active_users": other_active_users_emails,  # 다른 활성 사용자 목록 (최대 5명)
            },
            "daily_stats": daily_stats,
            "access_logs": formatted_logs,
            "period_days": 7,  # 기본 기간 추가
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[ERROR] 사용자 서비스 상세 통계 조회 중 오류: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"사용자 서비스 상세 통계 조회 중 오류가 발생했습니다: {str(e)}")


# 서비스 사용자별 접속 통계 조회 API
@monitoring_router.get("/services/{service_id}/user-stats")
async def get_service_user_stats(
    service_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """특정 서비스의 사용자별 접속 통계를 조회합니다."""
    try:
        # 관리자 권한 체크 (일반 사용자는 자신의 서비스만 조회 가능)
        if not current_user.is_admin:
            # 서비스에 대한 접근 권한 확인
            user_service = (
                db.query(user_services)
                .filter(user_services.c.service_id == service_id, user_services.c.user_id == current_user.id)
                .first()
            )

            if not user_service:
                raise HTTPException(status_code=403, detail="이 서비스의 통계를 조회할 권한이 없습니다.")

        # 서비스 존재 여부 확인
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다.")

        # 오늘 날짜 기준
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

        # 디버깅용 - 계산 기준 시간 출력
        print(f"[DEBUG] 통계 계산 기준 - 오늘 시작: {today_start.isoformat()}")

        # 서비스를 이용한 사용자 목록 직접 조회 (이메일 정보 포함)
        user_stats_query = (
            db.query(
                models.User.id,
                models.User.email,
                models.User.is_admin,
                func.count(models.ServiceAccess.id)
                .filter(models.ServiceAccess.is_active == True)
                .label("active_sessions"),
                func.count(models.ServiceAccess.id)
                .filter(models.ServiceAccess.access_time >= today_start)
                .label("today_accesses"),
                func.count(models.ServiceAccess.id).label("total_accesses"),
                func.max(models.ServiceAccess.access_time).label("last_access_time"),
            )
            .join(
                models.ServiceAccess,
                and_(models.ServiceAccess.user_id == models.User.id, models.ServiceAccess.service_id == service_id),
            )
            .group_by(models.User.id)
            .order_by(models.User.email)
        )

        # 쿼리 실행 및 결과 가공
        user_stats_results = user_stats_query.all()

        # 디버깅용 로그
        print(f"[DEBUG] 서비스 {service_id}에 대한 사용자 통계 쿼리 결과: {len(user_stats_results)}개 레코드")

        # 결과가 없을 경우 보완적인 쿼리
        if not user_stats_results:
            # ServiceAccess의 사용자 ID 기반으로 별도 조회
            user_ids = (
                db.query(models.ServiceAccess.user_id)
                .filter(models.ServiceAccess.service_id == service_id, models.ServiceAccess.user_id.isnot(None))
                .distinct()
                .all()
            )

            print(f"[DEBUG] 서비스 {service_id}에 접근한 고유 사용자 ID: {user_ids}")

            # 사용자 ID 목록이 있을 경우 상세 정보 조회
            user_ids = [uid[0] for uid in user_ids]

            if user_ids:
                users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
                print(f"[DEBUG] 조회된 사용자 수: {len(users)}")
            else:
                users = []
                print("[DEBUG] 조회된 사용자 없음")

            # 각 사용자별 접근 통계 개별 계산
            user_stats = []
            for user in users:
                active_sessions = (
                    db.query(func.count(models.ServiceAccess.id))
                    .filter(
                        models.ServiceAccess.user_id == user.id,
                        models.ServiceAccess.service_id == service_id,
                        models.ServiceAccess.is_active == True,
                    )
                    .scalar()
                    or 0
                )

                today_accesses = (
                    db.query(func.count(models.ServiceAccess.id))
                    .filter(
                        models.ServiceAccess.user_id == user.id,
                        models.ServiceAccess.service_id == service_id,
                        models.ServiceAccess.access_time >= today_start,
                    )
                    .scalar()
                    or 0
                )

                total_accesses = (
                    db.query(func.count(models.ServiceAccess.id))
                    .filter(models.ServiceAccess.user_id == user.id, models.ServiceAccess.service_id == service_id)
                    .scalar()
                    or 0
                )

                last_access = (
                    db.query(models.ServiceAccess.access_time)
                    .filter(models.ServiceAccess.user_id == user.id, models.ServiceAccess.service_id == service_id)
                    .order_by(models.ServiceAccess.access_time.desc())
                    .first()
                )

                user_stats.append(
                    {
                        "email": user.email,  # 이메일 주소 중심으로 표시
                        "user_name": user.email.split("@")[0],  # 사용자 이름 추출
                        "active_sessions": active_sessions,
                        "today_accesses": today_accesses,
                        "total_accesses": total_accesses,
                        "last_access": last_access[0].strftime("%Y-%m-%d %H:%M:%S") if last_access else None,
                        "is_admin": user.is_admin,
                        "user_id": user.id,  # ID는 참조용으로만 포함
                    }
                )
        else:
            # 쿼리 결과를 가공하여 응답 형식에 맞게 변환
            user_stats = []
            for result in user_stats_results:
                user_stats.append(
                    {
                        "email": result.email,  # 이메일 주소 중심으로 표시
                        "user_name": result.email.split("@")[0],  # 사용자 이름 추출
                        "active_sessions": result.active_sessions,
                        "today_accesses": result.today_accesses,
                        "total_accesses": result.total_accesses,
                        "last_access": (
                            result.last_access_time.strftime("%Y-%m-%d %H:%M:%S") if result.last_access_time else None
                        ),
                        "is_admin": result.is_admin,
                        "user_id": result.id,  # ID는 참조용으로만 포함
                    }
                )

        # 접속 횟수에 따라 내림차순 정렬
        user_stats = sorted(user_stats, key=lambda x: x["total_accesses"], reverse=True)

        # 디버깅용 로그 추가
        for stat in user_stats:
            print(
                f"[DEBUG] 사용자 통계: {stat['email']} - 접속 횟수: {stat['total_accesses']}, 오늘: {stat['today_accesses']}"
            )

        return {"user_stats": user_stats, "service_name": service.name}

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[ERROR] 서비스 사용자별 통계 조회 중 오류: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"서비스 사용자별 통계 조회 중 오류가 발생했습니다: {str(e)}")


# 서비스 날짜별 접속 통계 조회 API
@monitoring_router.get("/services/{service_id}/daily-stats")
async def get_service_daily_stats(
    service_id: str,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """특정 서비스의 날짜별 접속 통계를 조회합니다."""
    try:
        # 관리자 권한 체크 (일반 사용자는 자신의 서비스만 조회 가능)
        if not current_user.is_admin:
            # 서비스에 대한 접근 권한 확인
            user_service = (
                db.query(user_services)
                .filter(user_services.c.service_id == service_id, user_services.c.user_id == current_user.id)
                .first()
            )

            if not user_service:
                raise HTTPException(status_code=403, detail="이 서비스의 통계를 조회할 권한이 없습니다.")

        # 서비스 존재 여부 확인
        service = db.query(models.Service).filter(models.Service.id == service_id).first()
        if not service:
            raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다.")

        # 디버깅용 로그 - 날짜 범위
        end_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        start_date = end_date - timedelta(days=days - 1)
        print(
            f"[DEBUG] 서비스 {service_id} 일별 통계 - 조회 기간: {start_date.strftime('%Y-%m-%d')} ~ {end_date.strftime('%Y-%m-%d')} ({days}일)"
        )

        # 날짜별 통계 계산
        daily_stats = []

        # 오늘부터 지정된 일수만큼 과거로 거슬러 올라가며 통계 계산
        for day in range(days):
            day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=day)
            day_end = day_start + timedelta(days=1)

            # 날짜 형식
            date_str = day_start.strftime("%Y-%m-%d")

            # 디버깅 로그
            print(f"[DEBUG] 일별 통계 계산 중: {date_str}")

            # 해당 일자의 총 접속 수 - ServiceAccess 테이블 기준으로 계산
            total_accesses = (
                db.query(func.count(models.ServiceAccess.id))
                .filter(
                    models.ServiceAccess.service_id == service_id,
                    models.ServiceAccess.access_time >= day_start,
                    models.ServiceAccess.access_time < day_end,
                )
                .scalar()
                or 0
            )

            # 해당 일자의 고유 사용자 수 (이메일 기준)
            unique_users_query = (
                db.query(func.count(func.distinct(models.User.email)))
                .join(models.ServiceAccess, models.ServiceAccess.user_id == models.User.id)
                .filter(
                    models.ServiceAccess.service_id == service_id,
                    models.ServiceAccess.access_time >= day_start,
                    models.ServiceAccess.access_time < day_end,
                )
            )

            unique_users = unique_users_query.scalar() or 0

            # 디버깅 로그
            print(f"[DEBUG] {date_str} - 접속 수: {total_accesses}, 고유 사용자: {unique_users}")

            # 시간별 통계 - 모든 시간대 통계 포함 (0이어도 포함)
            hourly_stats = []
            for hour in range(24):
                hour_start = day_start.replace(hour=hour)
                hour_end = hour_start + timedelta(hours=1)

                hour_accesses = (
                    db.query(func.count(models.ServiceAccess.id))
                    .filter(
                        models.ServiceAccess.service_id == service_id,
                        models.ServiceAccess.access_time >= hour_start,
                        models.ServiceAccess.access_time < hour_end,
                    )
                    .scalar()
                    or 0
                )

                # 시간별 고유 사용자 수
                hour_unique_users = (
                    db.query(func.count(func.distinct(models.ServiceAccess.user_id)))
                    .filter(
                        models.ServiceAccess.service_id == service_id,
                        models.ServiceAccess.access_time >= hour_start,
                        models.ServiceAccess.access_time < hour_end,
                        models.ServiceAccess.user_id.isnot(None),
                    )
                    .scalar()
                    or 0
                )

                hourly_stats.append(
                    {
                        "hour": hour,
                        "accesses": hour_accesses,
                        "unique_users": hour_unique_users,
                        "hour_formatted": f"{hour:02d}:00",
                    }
                )

            daily_stats.append(
                {
                    "date": date_str,
                    "total_accesses": total_accesses,
                    "unique_users": unique_users,
                    "hourly_stats": hourly_stats,
                    "day_of_week": day_start.strftime("%A"),  # 요일 정보 추가
                }
            )

        # 최신 날짜가 먼저 오도록 정렬
        daily_stats = sorted(daily_stats, key=lambda x: x["date"], reverse=True)

        # 서비스 기본 정보 포함
        result = {
            "daily_stats": daily_stats,
            "service_name": service.name,
            "service_id": service_id,
            "stats_period": {
                "start_date": start_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
                "days": days,
            },
        }

        return result

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[ERROR] 서비스 날짜별 통계 조회 중 오류: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"서비스 날짜별 통계 조회 중 오류가 발생했습니다: {str(e)}")
