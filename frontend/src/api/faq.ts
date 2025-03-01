import instance from './axios';

// 서비스 타입 정의
export interface Service {
  id: string;
  name: string;
}

// FAQ 항목의 타입 정의
export interface FaqItem {
  id: string;
  title: string;
  content: string;
  category: string;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  service_id?: string | null; // 서비스 ID 추가 (null 허용)
  author?: string; // 작성자 추가
  author_id?: string; // 작성자 ID 추가
  post_type: 'faq' | 'notice' | 'inquiry'; // 게시물 유형 (FAQ, 공지사항, 질의응답)
  status?: 'pending' | 'in_progress' | 'completed' | 'not_applicable'; // 처리 상태 (질의응답용)
  response?: string; // 관리자 응답 (질의응답용)
}

// FAQ 유형 옵션 정의
export const POST_TYPE_OPTIONS = [
  { value: 'faq', label: 'FAQ' },
  { value: 'notice', label: '공지사항' },
  { value: 'inquiry', label: '서비스 질의' }
];

// 처리 상태 옵션 정의
export const STATUS_OPTIONS = [
  { value: 'pending', label: '대기중', color: 'yellow' },
  { value: 'in_progress', label: '처리중', color: 'blue' },
  { value: 'completed', label: '처리완료', color: 'green' },
  { value: 'not_applicable', label: '해당없음', color: 'gray' }
];

// 상태 색상 맵핑
export const getStatusColor = (status?: string) => {
  if (!status) return 'gray';
  const option = STATUS_OPTIONS.find(opt => opt.value === status);
  return option ? option.color : 'gray';
};

// 게시물 유형 레이블 가져오기
export const getPostTypeLabel = (type: string) => {
  const option = POST_TYPE_OPTIONS.find(opt => opt.value === type);
  return option ? option.label : 'FAQ';
};

// 상태 레이블 가져오기
export const getStatusLabel = (status?: string) => {
  if (!status) return '해당없음';
  const option = STATUS_OPTIONS.find(opt => opt.value === status);
  return option ? option.label : '해당없음';
};

// API 오류 처리 함수
const handleApiError = (error: any, message: string): never => {
  console.error(`${message}:`, error);
  if (error.response) {
    throw new Error(error.response.data.detail || message);
  }
  throw new Error(message);
};

/**
 * 관리자 권한 확인 API
 * @returns {Promise<boolean>} 관리자 여부
 */
export const checkAdminStatus = async (): Promise<boolean> => {
  try {
    const response = await instance.get('/auth/check-admin');
    return response.data.is_admin;
  } catch (error) {
    console.error('관리자 권한 확인 중 오류:', error);
    return false;
  }
};

/**
 * 서비스 목록 가져오기 API
 * @returns {Promise<Service[]>} 서비스 목록
 */
export const fetchServices = async (): Promise<Service[]> => {
  try {
    // 관리자 여부 확인
    const isAdmin = await checkAdminStatus();
    
    // 권한에 따라 다른 엔드포인트 호출
    let endpoint = '/services'; // 관리자용 기본 엔드포인트
    
    if (!isAdmin) {
      // 일반 사용자는 사용 가능한 서비스만 조회
      endpoint = '/my-approved-services'; // 사용자에게 승인된 서비스
      
      console.log('일반 사용자용 서비스 목록 조회 중');
    } else {
      console.log('관리자용 서비스 전체 목록 조회 중');
    }
    
    const response = await instance.get(endpoint);
    return response.data;
  } catch (error) {
    console.error('서비스 목록 가져오기 오류:', error);
    
    // 오류 발생 시 빈 배열 반환 (UI에서 처리 가능하도록)
    return [];
  }
};

/**
 * FAQ 목록 가져오기 API
 * @param {boolean} isAdmin 관리자 여부
 * @returns {Promise<FaqItem[]>} FAQ 목록
 */
export const fetchFaqs = async (isAdmin: boolean): Promise<FaqItem[]> => {
  try {
    // 서비스 접근 권한 관련 정보는 UI 단에서 필터링하므로 
    // 백엔드에서는 모든 FAQ를 가져옵니다.
    const endpoint = '/faqs';
    
    // 모든 FAQ 가져오기
    const response = await instance.get(endpoint);
    console.log(`백엔드에서 ${response.data.length}개의 FAQ를 가져왔습니다.`);
    
    return response.data;
  } catch (error) {
    handleApiError(error, 'FAQ 목록 가져오기 오류');
    return [];
  }
};

/**
 * FAQ 항목 저장하기 API (새로 생성 또는 수정)
 * @param {FaqItem} faq 저장할 FAQ 항목
 * @returns {Promise<FaqItem>} 저장된 FAQ 항목
 */
export const saveFaq = async (faq: FaqItem): Promise<FaqItem> => {
  try {
    const isNewItem = !faq.id;
    let response;
    
    // 빈 문자열 서비스 ID 처리 - 백엔드는 null을 기대함
    const requestData = { ...faq };
    
    // service_id가 빈 문자열인 경우 명시적으로 null로 설정
    // undefined인 경우도 명시적으로 null로 설정해서 백엔드에 전달되도록 함
    if (!requestData.service_id || requestData.service_id === '') {
      requestData.service_id = null;
      console.log('서비스 ID를 명시적으로 null로 설정');
    } else {
      console.log(`서비스 ID 사용: ${requestData.service_id}`);
    }
    
    // 현재 로그인한 사용자 정보 가져오기
    const { email } = getCurrentUser();
    const isAdmin = localStorage.getItem('is_admin') === 'true';
    
    // 기존 항목 수정 시 (ID가 있는 경우)
    if (!isNewItem) {
      // API 호출 전 현재 항목의 상태 확인 (응답이 있는 문의인지)
      if (requestData.post_type === 'inquiry' && 
          requestData.response && 
          !isAdmin && 
          requestData.author_id === email) {
        throw new Error('관리자가 이미 답변한 문의는 수정할 수 없습니다.');
      }
      
      // 기존 항목 수정
      const { id, ...updateData } = requestData;
      console.log(`FAQ ID ${id} 업데이트:`, updateData);
      response = await instance.put(`/faqs/${id}`, updateData);
    } 
    // 새 항목 생성 시
    else {
      // 이메일을 작성자 ID로 설정
      if (!requestData.author_id) {
        requestData.author_id = email;
        console.log(`작성자 ID 설정: ${email}`);
      }
      
      // 작성자명이 없는 경우 이메일을 설정
      if (!requestData.author) {
        requestData.author = email;
        console.log(`작성자명 설정: ${email}`);
      }
      
      // 새 항목 생성
      console.log('새 FAQ 항목 생성:', requestData);
      response = await instance.post('/faqs', requestData);
    }
    
    return response.data;
  } catch (error) {
    handleApiError(error, 'FAQ 저장 오류');
    // 에러 메시지 처리 수정
    if (error instanceof Error) {
      throw new Error(error.message || 'FAQ 저장 중 오류가 발생했습니다.');
    } else {
      throw new Error('FAQ 저장 중 오류가 발생했습니다.');
    }
  }
};

/**
 * FAQ 항목 삭제하기 API
 * @param {string} id 삭제할 FAQ ID
 * @returns {Promise<void>}
 */
export const deleteFaq = async (id: string): Promise<void> => {
  try {
    // 먼저 해당 FAQ 항목의 최신 정보를 가져옵니다
    const response = await instance.get(`/faqs/${id}`);
    const faqItem: FaqItem = response.data;
    
    // 현재 사용자 정보 가져오기
    const { email } = getCurrentUser();
    const isAdmin = localStorage.getItem('is_admin') === 'true';
    
    // 관리자가 답변한 문의글이면서 관리자가 아닌 경우 삭제 불가능
    if (faqItem.post_type === 'inquiry' && 
        faqItem.response && 
        !isAdmin && 
        faqItem.author_id === email) {
      throw new Error('관리자가 이미 답변한 문의는 삭제할 수 없습니다.');
    }
    
    // 삭제 진행
    await instance.delete(`/faqs/${id}`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    } else {
      handleApiError(error, 'FAQ 삭제 오류');
      throw new Error('FAQ 삭제 중 오류가 발생했습니다.');
    }
  }
};

/**
 * 현재 사용자 정보 가져오기
 * @returns {Object} 사용자 이메일 및 이름
 */
export const getCurrentUser = () => {
  // 로컬 스토리지에서 현재 사용자 정보 가져오기
  const email = localStorage.getItem('user_email') || localStorage.getItem('email') || '';
  
  // 이메일이 없는 경우
  if (!email) {
    console.warn('사용자 이메일을 찾을 수 없습니다. 로그인 상태를 확인하세요.');
    // 로그인 페이지로 리다이렉트하는 로직을 추가할 수 있습니다.
    // window.location.href = '/login';
  }
  
  const name = email ? email.split('@')[0] : '';
  
  return { email, name };
};

export default {
  fetchFaqs,
  fetchServices,
  saveFaq,
  deleteFaq,
  checkAdminStatus,
  getCurrentUser,
  getPostTypeLabel,
  getStatusLabel,
  getStatusColor,
  POST_TYPE_OPTIONS,
  STATUS_OPTIONS
}; 