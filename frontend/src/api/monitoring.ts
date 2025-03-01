import axios from 'axios';
import instance from './axios';

// API 요청을 위한 공통 에러 처리 함수
const handleApiError = (error: unknown, defaultValue: any, errorPrefix: string = 'API 오류:') => {
  console.error(`${errorPrefix}`, error);
  if (axios.isAxiosError(error)) {
    console.error(`API 오류 상세: ${error.response?.status} - ${error.message}`);
  }
  return defaultValue;
};

// 세션 ID를 로컬 스토리지에서 가져오거나 새로 생성
export const getSessionId = (): string => {
  let sessionId = localStorage.getItem('monitoring_session_id');
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('monitoring_session_id', sessionId);
  }
  return sessionId;
};

// 서비스 접근 기록
export const recordServiceAccess = async (serviceId: string, sessionId?: string) => {
  console.log('recordServiceAccess 호출됨');
  console.log(`'serviceId': ${serviceId}`);
  console.log(`'sessionId': ${sessionId}`);
  const url = '/services/access';
  const fullUrl = instance.defaults.baseURL + url;
  
  // 세션 ID가 없으면 생성
  if (!sessionId) {
    sessionId = getSessionId();
    console.log(`[세션 정보] 세션 ID 생성됨: ${sessionId}`);
  } else {
    console.log(`[세션 정보] 기존 세션 ID 사용: ${sessionId}`);
  }
  
  const token = localStorage.getItem('token');
  console.log(`[인증 정보] 토큰 존재 여부: ${token ? '있음' : '없음'}`);
  
  // 요청 데이터 생성
  const requestData = {
    service_id: serviceId,
    session_id: sessionId
  };
  
  console.log(`[API 호출 상세] POST ${url}`);
  console.log(`[API 호출 상세] 전체 URL: ${fullUrl}`);
  console.log(`[API 호출 상세] 요청 데이터:`, requestData);
  
  try {
    // instance로 변경하여 인증 토큰이 자동으로 포함되도록 함
    const response = await instance.post(url, requestData);
    
    console.log(`[API 성공] 서비스 접근 기록 응답:`, response.status, response.data);
    return response.data;
  } catch (error: unknown) {
    console.error(`[API 오류] 서비스 ${serviceId} 접근 기록 저장 실패:`, error);
    
    if (axios.isAxiosError(error)) {
      console.error(`[API 상세 오류] 상태 코드: ${error.response?.status}, 메시지: ${error.message}`);
      console.error(`[API 오류 URL] 요청 URL: ${fullUrl}`);
      console.error(`[API 오류 데이터] 요청 데이터:`, requestData);
      
      // 에러 유형별 처리
      if (error.response?.status === 401) {
        console.error('[인증 오류] 토큰이 유효하지 않거나 만료되었습니다.');
      } else if (error.response?.status === 404) {
        console.error('[경로 오류] 서비스 접근 API 경로를 찾을 수 없습니다:', url);
        console.error('[디버깅 제안] 백엔드 서버의 라우터 구성을 확인하세요. 경로가 /services/access인지 확인하세요.');
      } else if (error.response?.status === 405) {
        console.error('[메서드 오류] 서비스 접근 API에서 POST 메서드가 허용되지 않습니다.');
        console.error('[디버깅 제안] 백엔드 서버에서 해당 경로가 POST 메서드를 지원하는지 확인하세요.');
      } else if (error.response?.status === 422) {
        console.error('[데이터 오류] 서비스 접근 API 요청 데이터가 올바르지 않습니다.');
        console.error('[디버깅 제안] 요청 데이터 형식을 확인하세요:', requestData);
      }
    }
    
    return handleApiError(
      error, 
      { status: 'error', session_id: sessionId },
      `서비스 ${serviceId} 접근 기록 저장 실패:`
    );
  }
};

// 서비스 하트비트 전송 (세션 유지)
export const sendHeartbeat = async (sessionId: string) => {
  const url = '/services/heartbeat';
  const fullUrl = instance.defaults.baseURL + url;
  console.log(`[API 호출] 하트비트 전송 요청: ${url} (전체 URL: ${fullUrl}), 세션 ID: ${sessionId}`);
  
  try {
    // instance로 변경하여 인증 토큰이 자동으로 포함되도록 함
    const response = await instance.post(url, {
      session_id: sessionId
    });
    
    console.log(`[API 성공] 하트비트 응답:`, response.status);
    return response.data;
  } catch (error: unknown) {
    console.error(`[API 오류] 하트비트 전송 실패:`, error);
    
    if (axios.isAxiosError(error)) {
      console.error(`[API 상세 오류] 상태 코드: ${error.response?.status}, 메시지: ${error.message}`);
      
      if (error.response?.status === 404) {
        console.error('[경로 오류] 하트비트 전송 API 경로를 찾을 수 없습니다:', url);
      }
    }
    
    return handleApiError(
      error,
      { status: 'error' },
      '하트비트 전송 실패:'
    );
  }
};

// 서비스 접근 종료
export const endServiceAccess = async (sessionId: string) => {
  const url = '/services/session/end';
  const fullUrl = instance.defaults.baseURL + url;
  console.log(`[API 호출] 세션 종료 요청: ${url} (전체 URL: ${fullUrl}), 세션 ID: ${sessionId}`);
  
  try {
    // instance로 변경하여 인증 토큰이 자동으로 포함되도록 함
    const response = await instance.post(url, {
      session_id: sessionId
    });
    
    console.log(`[API 성공] 세션 종료 응답:`, response.status);
    return response.data;
  } catch (error: unknown) {
    console.error(`[API 오류] 서비스 접근 종료 실패:`, error);
    
    if (axios.isAxiosError(error)) {
      console.error(`[API 상세 오류] 상태 코드: ${error.response?.status}, 메시지: ${error.message}`);
      
      if (error.response?.status === 404) {
        console.error('[경로 오류] 세션 종료 API 경로를 찾을 수 없습니다:', url);
      }
    }
    
    return handleApiError(
      error,
      { status: 'error' },
      '서비스 접근 종료 실패:'
    );
  }
};

// 서비스 상태 조회 함수
export const getServicesStatus = async () => {
  const url = '/services/status';
  console.log(`[API 호출] 서비스 상태 조회 요청: ${url}`);
  
  try {
    // instance로 변경하여 인증 토큰이 자동으로 포함되도록 함
    const response = await instance.get(url);
    
    console.log(`[API 성공] 서비스 상태 조회 응답:`, response.status);
    return response.data;
  } catch (error: unknown) {
    console.error(`[API 오류] 서비스 상태 조회 실패:`, error);
    
    if (axios.isAxiosError(error)) {
      console.error(`[API 상세 오류] 상태 코드: ${error.response?.status}, 메시지: ${error.message}`);
    }
    
    return handleApiError(
      error,
      {},
      '서비스 상태 조회 실패:'
    );
  }
};

// 모든 서비스의 접속 통계 조회
export const getAccessStats = async (
  period: string = 'today',
  startDate?: string,
  endDate?: string
) => {
  let url = '/monitoring/services/stats';
  const params = new URLSearchParams();
  
  if (period) {
    params.append('period', period);
  }
  
  if (startDate && endDate) {
    params.append('start_date', startDate);
    params.append('end_date', endDate);
  }
  
  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }
  
  const token = localStorage.getItem('token');
  
  console.log(`[API 호출] 전체 서비스 통계 요청: ${url}`);
  console.log(`[인증 정보] 토큰 존재 여부: ${token ? '있음' : '없음'}`);
  
  try {
    // 토큰을 수동으로 확인하여 디버깅
    if (!token) {
      console.warn('[인증 경고] 토큰이 없습니다. 인증 오류가 발생할 수 있습니다.');
    }
    
    const response = await instance.get(url);
    console.log(`[API 성공] 전체 서비스 통계 응답 상태 코드:`, response.status);
    console.log(`[API 성공] 전체 서비스 통계 데이터:`, response.data);
    
    // 백엔드 응답 구조 확인 및 변환
    const data = response.data;
    
    // 필요한 경우 필드명을 일관되게 변환
    if (data.services_stats && Array.isArray(data.services_stats)) {
      data.services_stats = data.services_stats.map((service: any) => ({
        ...service,
        // 필드명 일관성 유지
        total_accesses_today: service.total_accesses || 0
      }));
    } else {
      console.warn('[API 경고] services_stats가 배열이 아니거나 존재하지 않습니다:', data);
      data.services_stats = [];
    }
    
    // 기간 정보 추가
    if (!data.period) {
      data.period = period;
    }
    
    return data;
  } catch (error: unknown) {
    console.error(`[API 오류] 전체 서비스 통계 조회 실패:`, error);
    if (axios.isAxiosError(error)) {
      console.error(`[API 상세 오류] 상태 코드: ${error.response?.status}, 메시지: ${error.message}`);
      
      // 401 에러인 경우 토큰 문제일 가능성이 높음
      if (error.response?.status === 401) {
        console.error('[인증 오류] 토큰이 유효하지 않거나 만료되었습니다. 재로그인이 필요할 수 있습니다.');
      }
    }
    
    return handleApiError(
      error,
      {
        total_active_users: 0,
        total_accesses: 0,
        period: period,
        services_stats: []
      },
      '서비스 접속 통계 조회 실패:'
    );
  }
};

// 특정 서비스의 접속 통계 조회
export const getServiceAccessStats = async (
  serviceId: string,
  period: string = 'today',
  startDate?: string,
  endDate?: string
) => {
  let url = `/monitoring/services/stats/${serviceId}`;
  const params = new URLSearchParams();
  
  if (period) {
    params.append('period', period);
  }
  
  if (startDate && endDate) {
    params.append('start_date', startDate);
    params.append('end_date', endDate);
  }
  
  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }
  
  console.log(`[API 호출] 서비스 통계 요청: ${url}`);
  
  try {
    const response = await instance.get(url);
    console.log(`[API 성공] 서비스 통계 응답:`, response.status, response.data);
    return response.data;
  } catch (error: unknown) {
    console.error(`[API 오류] 서비스 ${serviceId} 통계 조회 실패:`, error);
    if (axios.isAxiosError(error)) {
      console.error(`[API 상세 오류] 상태 코드: ${error.response?.status}, 메시지: ${error.message}`);
    }
    
    return handleApiError(
      error,
      {
        service_id: serviceId,
        service_name: '정보 없음',
        active_users: 0,
        total_accesses: 0,
        period: period,
        status: 'stopped',
        last_status_change: '정보 없음',
        hourly_stats: []
      },
      `서비스 ${serviceId} 접속 통계 조회 실패:`
    );
  }
};

// 서비스 상세 모니터링 데이터 조회
export const getServiceDetailedStats = async (serviceId: string) => {
  const url = `/monitoring/services/monitoring/${serviceId}`;
  console.log(`[API 호출] 서비스 상세 모니터링 요청: ${url}`);
  
  try {
    const response = await instance.get(url);
    console.log(`[API 성공] 서비스 상세 모니터링 응답:`, response.status);
    return response.data;
  } catch (error: unknown) {
    console.error(`[API 오류] 서비스 ${serviceId} 상세 모니터링 조회 실패:`, error);
    if (axios.isAxiosError(error)) {
      console.error(`[API 상세 오류] 상태 코드: ${error.response?.status}, 메시지: ${error.message}`);
    }
    
    return handleApiError(
      error,
      {
        cpu: Array(24).fill(0),
        memory: Array(24).fill(0),
        requests: Array(24).fill(0),
        errors: Array(24).fill(0),
        responseTime: Array(24).fill(0),
        timestamps: [],
        status: {
          current: 'stopped',
          last_changed: '정보 없음',
          uptime_percentage: 0
        },
        recent_logs: []
      },
      `서비스 ${serviceId} 상세 모니터링 데이터 조회 실패:`
    );
  }
};

// 사용자별 접속 통계 조회 (관리자용)
export const getUserAccessStats = async () => {
  try {
    const response = await instance.get('/monitoring/users/stats');
    return response.data;
  } catch (error) {
    return handleApiError(
      error,
      [],
      '사용자 접속 통계 조회 실패:'
    );
  }
};

// 통계 조회 (일별 또는 사용자별)
export const getStatistics = async (type: 'daily' | 'user', id?: number, days: number = 7) => {
  try {
    let url = '/monitoring/statistics/daily';
    
    if (type === 'user' && id) {
      url = `/monitoring/user/${id}/stats`;
    }
    
    url += `?days=${days}`;
    const response = await instance.get(url);
    return response.data;
  } catch (error) {
    return handleApiError(
      error,
      null,
      `${type === 'daily' ? '일별' : '사용자'} 통계 조회 실패:`
    );
  }
};

// 서비스 삭제 함수
export const deleteService = async (serviceId: string) => {
  try {
    const response = await instance.delete(`/services/${serviceId}`);
    return response.data;
  } catch (error) {
    // 에러를 상위 호출자에게 전파하여 적절한 처리 가능하도록 함
    console.error('서비스 삭제 실패:', error);
    throw error;
  }
};

// 서비스 사용자별 접속 통계 조회
export const getUserStatsForService = async (serviceId: string) => {
  const url = `/monitoring/services/${serviceId}/user-stats`;
  console.log(`[API 호출] 서비스 사용자 통계 요청: ${url}`);
  
  try {
    const response = await instance.get(url);
    console.log(`[API 성공] 서비스 사용자 통계 응답:`, response.status);
    return response.data;
  } catch (error: unknown) {
    console.error(`[API 오류] 서비스 ${serviceId} 사용자 통계 조회 실패:`, error);
    if (axios.isAxiosError(error)) {
      console.error(`[API 상세 오류] 상태 코드: ${error.response?.status}, 메시지: ${error.message}`);
    }
    
    return handleApiError(
      error,
      {
        user_stats: []
      },
      `서비스 ${serviceId} 사용자별 통계 조회 실패:`
    );
  }
};

// 서비스 날짜별 접속 통계 조회
export const getDailyStatsForService = async (serviceId: string, days: number = 30) => {
  const url = `/monitoring/services/${serviceId}/daily-stats?days=${days}`;
  console.log(`[API 호출] 서비스 날짜별 통계 요청: ${url}`);
  
  try {
    const response = await instance.get(url);
    console.log(`[API 성공] 서비스 날짜별 통계 응답:`, response.status);
    return response.data;
  } catch (error: unknown) {
    console.error(`[API 오류] 서비스 ${serviceId} 날짜별 통계 조회 실패:`, error);
    if (axios.isAxiosError(error)) {
      console.error(`[API 상세 오류] 상태 코드: ${error.response?.status}, 메시지: ${error.message}`);
    }
    
    return handleApiError(
      error,
      {
        daily_stats: []
      },
      `서비스 ${serviceId} 날짜별 통계 조회 실패:`
    );
  }
};

// 서비스 인터페이스 정의
interface Service {
  id: string;
  name: string;
  description?: string;
  url: string;
  protocol?: string;
  show_info?: boolean;
}

// 사용자 서비스 접속 통계 조회 API
export const getUserServicesStats = async () => {
  console.log(`[API 호출] 사용자 서비스 통계 요청 시작`);
  
  try {
    const token = localStorage.getItem('token');
    console.log(`[API 호출] 토큰 존재 여부: ${token ? '있음' : '없음'}`);
    
    // 1. 승인된 서비스 목록 가져오기
    const response = await instance.get<Service[]>('/services/my-approved-services');
    console.log(`[API 성공] 사용자 서비스 목록 응답:`, response.status);
    
    // 2. 서비스 상태 정보 가져오기
    const statusResponse = await instance.get('/services/status');
    console.log(`[API 성공] 서비스 상태 응답:`, statusResponse.status);
    
    // 3. 모니터링 통계 정보 가져오기

    const url = '/monitoring/user/services/stats';
    const monitoringResponse = await instance.get(url);
    console.log(`[API 성공] 모니터링 통계 응답:`, monitoringResponse.status);
    
    // my-approved-services API 응답을 UserServicesData 형식으로 변환
    const services = response.data || [];
    const monitoringData = monitoringResponse.data || { services_stats: [] };
    
    // 변환된 데이터 형식 반환
    return {
      user_email: monitoringData.user_email || localStorage.getItem('email') || '',
      user_id: monitoringData.user_id || 0,
      is_admin: localStorage.getItem('isAdmin') === 'true',
      total_services: services.length,
      total_accesses: monitoringData.total_accesses || 0,
      period_days: monitoringData.period_days || 7,
      services_stats: services.map((service: Service) => {
        // 서비스 상태 정보 가져오기
        const serviceStatus = statusResponse.data[service.id] || { access: 'unavailable', running: 'offline' };
        
        // 모니터링 통계 정보 가져오기
        const serviceStats = monitoringData.services_stats?.find((s: any) => s.service_id === service.id) || {};
        
        return {
          service_id: service.id,
          service_name: service.name,
          description: service.description || '',
          status: serviceStatus.running === 'online' ? 'running' : 'stopped',
          today_accesses: serviceStats.today_accesses || 0,
          total_accesses: serviceStats.total_accesses || 0,
          total_period_accesses: serviceStats.period_accesses || 0,
          active_sessions: serviceStats.active_sessions || 0,
          concurrent_users: serviceStats.concurrent_users || 0,
          total_active_users: serviceStats.total_active_users || 0,
          last_access: serviceStats.last_access || null,
          url: service.url,
          has_active_session: serviceStatus.access === 'available'
        };
      })
    };
  } catch (error: unknown) {
    console.error('[API 오류] 사용자 서비스 통계 조회 실패:', error);
    if (axios.isAxiosError(error)) {
      console.error(`[API 상세 오류] 상태 코드: ${error.response?.status}, 메시지: ${error.message}`);
      console.error('[API 오류 상세]', error.response?.data);
    }
    
    return handleApiError(
      error,
      {
        user_email: '',
        user_id: 0,
        is_admin: false,
        total_services: 0,
        total_accesses: 0,
        period_days: 7,
        services_stats: []
      },
      '사용자 서비스 통계 조회 실패:'
    );
  }
};

// 사용자 서비스 상세 통계 조회 API
export const getUserServiceDetailStats = async (serviceId: string) => {
  console.log(`[API 호출] 사용자 서비스 상세 통계 요청: /monitoring/user/services/${serviceId}/detail`);
  
  try {
    const response = await instance.get(`/monitoring/user/services/${serviceId}/detail`);
    console.log(`[API 성공] 사용자 서비스 상세 통계 응답:`, response.status);
    
    // API 응답 데이터 반환
    return {
      service_id: serviceId,
      service_name: response.data.service_name,
      status: response.data.status as 'running' | 'stopped' | 'unknown',
      status_details: response.data.status_details || '',
      user_email: response.data.user_email,
      total_stats: {
        all_time_accesses: response.data.total_stats.all_time_accesses,
        today_accesses: response.data.total_stats.today_accesses,
        period_accesses: response.data.total_stats.period_accesses,
        active_sessions: response.data.total_stats.active_sessions,
        first_access: response.data.total_stats.first_access,
        last_access: response.data.total_stats.last_access,
        concurrent_users: response.data.total_stats.concurrent_users,
        other_active_users: response.data.total_stats.other_active_users || []
      },
      daily_stats: response.data.daily_stats || [],
      access_logs: response.data.access_logs || [],
      period_days: response.data.period_days || 7
    };
  } catch (error: unknown) {
    console.error(`[API 오류] 사용자 서비스 ${serviceId} 상세 통계 조회 실패:`, error);
    if (axios.isAxiosError(error)) {
      console.error(`[API 상세 오류] 상태 코드: ${error.response?.status}, 메시지: ${error.message}`);
      console.error('[API 오류 상세]', error.response?.data);
    }
    
    // 오류 발생 시 기본 데이터 반환
    return {
      service_id: serviceId,
      service_name: '알 수 없는 서비스',
      status: 'unknown' as const,
      status_details: '서비스 정보를 가져올 수 없습니다',
      user_email: localStorage.getItem('email') || '',
      total_stats: {
        all_time_accesses: 0,
        today_accesses: 0,
        period_accesses: 0,
        active_sessions: 0,
        first_access: null,
        last_access: null,
        concurrent_users: 0,
        other_active_users: []
      },
      daily_stats: [],
      access_logs: [],
      period_days: 7
    };
  }
}; 