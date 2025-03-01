import socket
import asyncio
import httpx
from typing import Dict, Optional, Tuple
from datetime import datetime, timedelta
from ..models import Service

# 서비스 상태 캐시 (메모리에 임시 저장)
status_cache = {}
CACHE_DURATION = timedelta(minutes=2)  # 캐시 유효 시간: 2분


async def check_service_status(service: Service, force_refresh: bool = False) -> Dict:
    """
    서비스 상태를 체크하는 통합 함수

    Args:
        service: 상태를 확인할 서비스 객체
        force_refresh: 캐시를 무시하고 강제로 새로 확인할지 여부

    Returns:
        서비스 상태 정보를 담은 딕셔너리
    """
    cache_key = f"{service.id}_{service.host}_{service.port}"

    # 캐시된 결과가 있고 유효하면 캐시 결과 반환
    if not force_refresh and cache_key in status_cache:
        cached_result = status_cache[cache_key]
        if cached_result["check_time"] + CACHE_DURATION > datetime.utcnow():
            return cached_result

    # 상태 확인 실행
    if service.is_ip:
        status, details = await check_ip_service(service)
    else:
        status, details = await check_domain_service(service)

    # 결과 저장 및 반환
    result = {"status": "running" if status else "stopped", "check_time": datetime.utcnow(), "details": details}

    # 캐시에 저장
    status_cache[cache_key] = result

    return result


async def check_ip_service(service: Service) -> Tuple[bool, str]:
    """IP 주소 기반 서비스 상태 확인"""
    try:
        # 소켓으로 연결 시도
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)  # 2초 타임아웃
        host = service.host
        port = service.port if service.port else 80

        # 비동기 실행을 위해 실행 루프에서 처리
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: sock.connect_ex((host, port)))

        sock.close()

        if result == 0:
            return True, "연결 성공"
        else:
            return False, f"연결 실패 (코드: {result})"

    except socket.timeout:
        return False, "연결 시간 초과"
    except socket.error as e:
        return False, f"소켓 오류: {str(e)}"
    except Exception as e:
        return False, f"예외 발생: {str(e)}"


async def check_domain_service(service: Service) -> Tuple[bool, str]:
    """도메인 기반 서비스 상태 확인"""
    try:
        # URL 구성
        url = f"{service.protocol}://{service.host}"
        if service.port is not None:
            if (service.protocol == "http" and service.port != 80) or (
                service.protocol == "https" and service.port != 443
            ):
                url += f":{service.port}"
        if service.base_path:
            url += service.base_path

        # 건강 확인 경로가 지정되어 있으면 추가
        if hasattr(service, "health_path") and service.health_path:
            url += service.health_path

        # HTTP 요청 수행
        async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
            response = await client.get(url)

            if 200 <= response.status_code < 500:
                return True, f"HTTP 응답: {response.status_code}"
            else:
                return False, f"HTTP 오류: {response.status_code}"

    except httpx.TimeoutException:
        return False, "HTTP 요청 시간 초과"
    except httpx.ConnectError:
        return False, "HTTP 연결 실패"
    except Exception as e:
        return False, f"HTTP 요청 예외: {str(e)}"


# 캐시 초기화 함수
def clear_status_cache():
    """상태 캐시를 초기화합니다."""
    global status_cache
    status_cache = {}


# 특정 서비스의 캐시 제거
def remove_from_cache(service_id: str):
    """특정 서비스의 캐시를 제거합니다."""
    global status_cache
    keys_to_remove = [k for k in status_cache if k.startswith(f"{service_id}_")]
    for key in keys_to_remove:
        if key in status_cache:
            del status_cache[key]
