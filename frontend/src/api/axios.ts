import axios from 'axios';
// instance to service_instance

// axios 기본 설정
// 환경 변수에서 백엔드 URL 가져오기 또는 기본값 사용
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

// 더 자세한 디버깅을 위한 로그
console.log('[설정] Backend URL 환경변수 확인:');
console.log('  - REACT_APP_BACKEND_URL:', process.env.REACT_APP_BACKEND_URL || '설정되지 않음');
console.log('  - 사용할 URL:', backendUrl);

const instance = axios.create({
  baseURL: backendUrl,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// 모든 axios 요청에 baseURL이 제대로 설정되었는지 확인
axios.defaults.baseURL = backendUrl;

// 상세 로깅으로 현재 설정된 baseURL 확인
console.log('[설정] axios baseURL 상세 정보:');
console.log('  - axios 인스턴스 baseURL:', instance.defaults.baseURL);
console.log('  - 전역 axios baseURL:', axios.defaults.baseURL);
console.log('  - 요청 경로 예시(services/access):', `${instance.defaults.baseURL}/services/access`);

// 토큰 갱신 중인지 확인하는 플래그
let isRefreshing = false;
// 토큰 갱신 대기 중인 요청들
let refreshSubscribers: ((token: string) => void)[] = [];

// 토큰 갱신 후 대기 중인 요청들에게 새 토큰 전달
const onRefreshed = (token: string) => {
  refreshSubscribers.forEach(callback => callback(token));
  refreshSubscribers = [];
};

// 토큰 갱신 요청 함수 - export하여 외부에서 명시적으로 호출할 수 있도록 함
export const refreshToken = async () => {
  try {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      console.error('[ERROR] 리프레시 토큰이 없습니다.');
      throw new Error('리프레시 토큰이 없습니다.');
    }

    console.log('[DEBUG] 리프레시 토큰으로 새 액세스 토큰 요청 시작:', refreshToken.substring(0, 10) + '...');
    console.log('[DEBUG] 토큰 갱신 요청 URL:', `${instance.defaults.baseURL}/refresh-token`);
    
    // 다양한 방식으로 시도
    let response;
    let error;
    
    // 1. JSON 형식으로 시도 - 인스턴스 사용
    try {
      response = await instance.post('/refresh-token', { refresh_token: refreshToken });
      console.log('[DEBUG] JSON 형식 토큰 갱신 성공:', response.data);
    } catch (jsonError) {
      console.log('[DEBUG] JSON 형식 요청 실패, 다른 방식 시도:', jsonError);
      error = jsonError;
      
      // 2. 텍스트 형식으로 시도 - 인스턴스 사용
      try {
        response = await instance.post('/refresh-token', refreshToken, {
          headers: {
            'Content-Type': 'text/plain',
          }
        });
        console.log('[DEBUG] 텍스트 형식 토큰 갱신 성공:', response.data);
      } catch (textError) {
        console.log('[DEBUG] 텍스트 형식 요청 실패, 다른 방식 시도:', textError);
        error = textError;
        
        // 3. URL 인코딩 형식으로 시도 - 인스턴스 사용
        try {
          response = await instance.post('/refresh-token', `refresh_token=${encodeURIComponent(refreshToken)}`, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            }
          });
          console.log('[DEBUG] URL 인코딩 형식 토큰 갱신 성공:', response.data);
        } catch (formError) {
          console.log('[DEBUG] URL 인코딩 형식 요청 실패, 다른 방식 시도:', formError);
          
          // 4. 쿼리 파라미터 방식 시도 - 인스턴스 사용
          try {
            response = await instance.post(`/refresh-token?refresh_token=${encodeURIComponent(refreshToken)}`);
            console.log('[DEBUG] 쿼리 파라미터 형식 토큰 갱신 성공:', response.data);
          } catch (queryError) {
            console.log('[DEBUG] 쿼리 파라미터 형식 요청 실패:', queryError);
            error = queryError;
            throw error; // 모든 방식 실패 시 에러 발생
          }
        }
      }
    }
    
    if (!response || !response.data) {
      throw new Error('토큰 갱신 응답에 데이터가 없습니다.');
    }
    
    let accessToken;
    
    // 응답 형식에 따라 액세스 토큰 추출
    if (response.data.access_token) {
      accessToken = response.data.access_token;
    } else if (typeof response.data === 'string' && response.data.includes('access_token')) {
      try {
        const jsonData = JSON.parse(response.data);
        accessToken = jsonData.access_token;
      } catch (e) {
        // 문자열에서 액세스 토큰 추출 시도
        const match = response.data.match(/access_token[\"'\s:=]+([^\"'\s,}]+)/);
        if (match && match[1]) {
          accessToken = match[1];
        }
      }
    } else if (typeof response.data === 'string' && response.data.startsWith('eyJ')) {
      // 응답이 직접 JWT 토큰인 경우
      accessToken = response.data;
    }
    
    if (!accessToken) {
      console.error('[ERROR] 응답에서 액세스 토큰을 찾을 수 없습니다:', response.data);
      throw new Error('액세스 토큰을 찾을 수 없습니다');
    }
    
    // 새 액세스 토큰 저장
    localStorage.setItem('token', accessToken);
    console.log('[DEBUG] 새 액세스 토큰 저장 완료:', accessToken.substring(0, 10) + '...');
    
    return accessToken;
  } catch (error) {
    console.error('[ERROR] 토큰 갱신 실패:', error);
    // 리프레시 토큰도 만료된 경우 로그아웃
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    
    // 로그인 페이지로 리디렉션 (1초 지연)
    setTimeout(() => {
      window.location.href = '/login';
    }, 1000);
    
    throw error;
  } finally {
    // 갱신 중 플래그 초기화
    isRefreshing = false;
  }
};

// 요청 인터셉터
instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    
    if (token) {
      // 헤더에 토큰 설정
      config.headers.Authorization = `Bearer ${token}`;
      
      // 쿠키에도 토큰 설정 (백엔드에서 쿠키를 통해 토큰을 찾을 수 있도록)
      // 주의: 이 방식은 보안을 위해 httpOnly, secure 옵션이 필요하지만, 클라이언트에서는 설정할 수 없음
      // 백엔드에서 토큰 탐지 알고리즘이 쿠키도 확인하도록 해야 함
      document.cookie = `access_token=${token}; path=/; max-age=3600;`;  
      
      console.log(`[요청] ${config.method?.toUpperCase()} ${config.url} - 인증 헤더 및 쿠키 포함`);
      
      // x-access-token 헤더도 추가 (일부 백엔드 구현에서 사용)
      config.headers['x-access-token'] = token;
      
      // 디버깅을 위한 로그
      console.log('[DEBUG] Sending request with token:', token.substring(0, 10) + '...');
      console.log('[DEBUG] Authorization 헤더:', `Bearer ${token.substring(0, 10)}...`);
    } else {
      console.warn(`[요청] ${config.method?.toUpperCase()} ${config.url} - 인증 헤더 없음!`);
    }
    
    // 명시적으로 URL 로깅하여 확인 
    console.log(`[DEBUG] 요청 URL: ${config.baseURL}${config.url}`);
    
    return config;
  },
  (error) => {
    console.error('[요청 오류]', error);
    return Promise.reject(error);
  }
);

// 응답 인터셉터
instance.interceptors.response.use(
  (response) => {
    console.log('[DEBUG] Response success:', response.status, response.config.url);
    return response;
  },
  async (error) => {
    console.error('[DEBUG] Response error:', error.response?.status, error.config?.url);
    
    const originalRequest = error.config;
    if (!originalRequest) {
      return Promise.reject(error);
    }
    
    // 토큰 관련 오류 (401 Unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      console.log('[DEBUG] 401 에러 감지, 로그인 화면으로 리디렉션');
      
      // 자동 토큰 갱신 시도 대신 로그인 페이지로 리디렉션
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      
      // 현재 페이지 정보 저장 (로그인 후 원래 페이지로 돌아오기 위함)
      localStorage.setItem('redirectAfterLogin', window.location.pathname);
      
      // 로그인 페이지로 리디렉션 (0.5초 지연)
      setTimeout(() => {
        window.location.href = '/login';
      }, 500);
      
      return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);

export default instance; 