import React, { useState, useEffect, useMemo } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import { FaEdit, FaTrash, FaPlus, FaSearch, FaEye, FaLink } from 'react-icons/fa';
import faqApi, { 
  FaqItem, 
  Service, 
  POST_TYPE_OPTIONS, 
  STATUS_OPTIONS, 
  getStatusLabel, 
  getPostTypeLabel, 
  getStatusColor
} from '../api/faq';

// FAQ 항목을 조회하는 모달 컴포넌트
interface FaqViewModalProps {
  faq: FaqItem | null;
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
}

const FaqViewModal: React.FC<FaqViewModalProps> = ({ faq, isOpen, onClose, services }) => {
  if (!isOpen || !faq) return null;

  // 서비스 이름 찾기
  const serviceName = faq.service_id 
    ? services.find(s => s.id === faq.service_id)?.name || '연결된 서비스 없음' 
    : '연결된 서비스 없음';

  // 게시물 유형에 따른 배경색 설정
  const typeColors = {
    faq: 'bg-blue-100 text-blue-800',
    notice: 'bg-purple-100 text-purple-800',
    inquiry: 'bg-amber-100 text-amber-800'
  };
  
  // 상태에 따른 배경색 설정
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    not_applicable: 'bg-gray-100 text-gray-800'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-3xl w-full max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${typeColors[faq.post_type] || 'bg-gray-100 text-gray-800'}`}>
                {getPostTypeLabel(faq.post_type)}
              </span>
              {faq.status && faq.post_type === 'inquiry' && (
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[faq.status] || 'bg-gray-100 text-gray-800'}`}>
                  {getStatusLabel(faq.status)}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold">{faq.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="mb-6 text-sm text-gray-600 flex flex-wrap items-center gap-4">
          <div className="py-1">
            <span className="font-semibold">카테고리:</span> {faq.category}
          </div>
          {faq.service_id && (
            <div className="flex items-center py-1">
              <FaLink className="mr-1" />
              <span className="font-semibold">서비스:</span> {serviceName}
            </div>
          )}
          {faq.author && (
            <div className="py-1">
              <span className="font-semibold">작성자:</span> {faq.author}
            </div>
          )}
          <div className="py-1">
            <span className="font-semibold">작성일:</span> {new Date(faq.created_at).toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
          <div className="py-1">
            <span className="font-semibold">수정일:</span> {new Date(faq.updated_at).toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
        </div>
        
        <div className="prose max-w-none mb-6 p-4 bg-gray-50 rounded-lg">
          <MarkdownRenderer content={faq.content} />
        </div>
        
        {faq.post_type === 'inquiry' && faq.response && (
          <div className="mt-6">
            <h3 className="text-lg font-bold text-green-700 mb-2">관리자 응답</h3>
            <div className="prose max-w-none p-4 bg-green-50 rounded-lg border border-green-100">
              <MarkdownRenderer content={faq.response} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// FAQ 항목을 편집하는 모달 컴포넌트
interface FaqEditModalProps {
  faq: FaqItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (faq: FaqItem) => Promise<void>;
  services: Service[];
  isAdmin: boolean;
}

const FaqEditModal: React.FC<FaqEditModalProps> = ({ faq, isOpen, onClose, onSave, services, isAdmin }) => {
  const [formData, setFormData] = useState<FaqItem>({
    id: '',
    title: '',
    content: '',
    category: '서비스',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_published: true,
    service_id: '',
    author: '',
    author_id: '',
    post_type: 'faq',
    status: 'pending',
    response: ''
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('content'); // 'content' 또는 'response'

  // FAQ 항목이 변경될 때 폼 데이터 업데이트
  useEffect(() => {
    if (faq) {
      setFormData(faq);
    } else {
      const newPostType = isAdmin ? 'faq' : 'inquiry';
      setFormData({
        id: '',
        title: '',
        content: '',
        category: '서비스',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_published: true,
        service_id: '',
        author: '',
        author_id: '',
        post_type: newPostType,
        status: newPostType === 'inquiry' ? 'pending' : 'not_applicable',
        response: ''
      });
    }
  }, [faq, isAdmin]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      setError('제목을 입력해주세요.');
      return;
    }
    
    if (!formData.content.trim()) {
      setError('내용을 입력해주세요.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSave({
        ...formData,
        updated_at: new Date().toISOString()
      });
      onClose();
    } catch (err) {
      console.error('FAQ 저장 중 오류:', err);
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {faq?.id ? `${getPostTypeLabel(formData.post_type)} 수정` : `${getPostTypeLabel(formData.post_type)} 추가`}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                제목
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="제목을 입력하세요"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                카테고리
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="서비스">서비스</option>
                <option value="계정">계정</option>
                <option value="일반">일반</option>
                <option value="기술지원">기술지원</option>
                <option value="권한">권한</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                관련 서비스 (선택사항)
              </label>
              <select
                value={formData.service_id || ''}
                onChange={(e) => setFormData({ ...formData, service_id: e.target.value || null })}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="">선택하지 않음</option>
                {services.length > 0 ? (
                  services.map(service => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))
                ) : (
                  <option value="" disabled>이용 가능한 서비스가 없습니다</option>
                )}
              </select>
              {!isAdmin && services.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  서비스 접근 권한이 없습니다. 필요한 서비스가 있으면 관리자에게 요청해주세요.
                </p>
              )}
            </div>
            
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  게시물 유형
                </label>
                <select
                  value={formData.post_type}
                  onChange={(e) => {
                    const newType = e.target.value as 'faq' | 'notice' | 'inquiry';
                    setFormData({ 
                      ...formData, 
                      post_type: newType,
                      status: newType === 'inquiry' ? 'pending' : 'not_applicable'
                    });
                  }}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  {POST_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}
            
            {!isAdmin && (
              <div className="flex items-center">
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                  서비스 질의
                </span>
                <span className="ml-2 text-sm text-gray-500">
                  사용자는 서비스 질의만 작성할 수 있습니다
                </span>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                작성자
              </label>
              <input
                type="text"
                value={formData.author}
                readOnly={!isAdmin} // 관리자만 수정 가능
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                className={`w-full p-2 border border-gray-300 rounded-md ${!isAdmin ? 'bg-gray-100' : ''}`}
                placeholder="작성자를 입력하세요"
              />
            </div>
            
            {isAdmin && formData.post_type === 'inquiry' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  처리 상태
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'pending' | 'in_progress' | 'completed' | 'not_applicable' })}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  {STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}
            
            {isAdmin && (
              <div className="md:col-span-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_published}
                    onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">공개 여부</span>
                </label>
              </div>
            )}
          </div>
          
          <div className="mb-4">
            <div className="flex border-b">
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium ${activeTab === 'content' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('content')}
              >
                내용
              </button>
              {isAdmin && formData.post_type === 'inquiry' && (
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium ${activeTab === 'response' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('response')}
                >
                  관리자 응답
                </button>
              )}
            </div>
            
            {activeTab === 'content' && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  내용 (마크다운 지원)
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md h-64 font-mono"
                  placeholder="내용을 마크다운 형식으로 작성하세요"
                />
              </div>
            )}
            
            {activeTab === 'response' && isAdmin && formData.post_type === 'inquiry' && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  관리자 응답 (마크다운 지원)
                </label>
                <textarea
                  value={formData.response}
                  onChange={(e) => setFormData({ ...formData, response: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md h-64 font-mono"
                  placeholder="질의에 대한 응답을 작성하세요"
                />
              </div>
            )}
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
              disabled={isSubmitting}
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// FAQ 게시판 메인 컴포넌트
const FaqBoard: React.FC = () => {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [services, setServices] = useState<Service[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  
  // 검색 및 필터링 상태
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [authorFilter, setAuthorFilter] = useState<string>('');
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);
  const [appliedFilters, setAppliedFilters] = useState<{
    searchTerm: string;
    categoryFilter: string;
    serviceFilter: string;
    typeFilter: string;
    statusFilter: string;
    authorFilter: string;
  }>({
    searchTerm: '',
    categoryFilter: '',
    serviceFilter: '',
    typeFilter: '',
    statusFilter: '',
    authorFilter: ''
  });
  
  // 모달 상태
  const [viewFaq, setViewFaq] = useState<FaqItem | null>(null);
  const [editFaq, setEditFaq] = useState<FaqItem | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // "내 게시물 보기" 버튼을 토글 방식으로 변경
  const [showMyPostsOnly, setShowMyPostsOnly] = useState(false);

  // 관리자 권한 확인
  useEffect(() => {
    const initializeUser = async () => {
      try {
        // 관리자 권한 확인
        const isAdminUser = await faqApi.checkAdminStatus();
        setIsAdmin(isAdminUser);
        
        // 현재 사용자 이메일 가져오기
        const { email } = faqApi.getCurrentUser();
        setCurrentUserEmail(email);
      } catch (error) {
        console.error('사용자 정보 초기화 중 오류:', error);
        setIsAdmin(false);
      }
    };
    
    initializeUser();
  }, []);
  
  // 서비스 목록 가져오기
  useEffect(() => {
    const loadServices = async () => {
      try {
        const serviceList = await faqApi.fetchServices();
        setServices(serviceList);
      } catch (error) {
        console.error('서비스 목록 가져오기 오류:', error);
        setError('서비스 목록을 불러오는 중 오류가 발생했습니다.');
      }
    };
    
    loadServices();
  }, []);
  
  // FAQ 목록 가져오기
  useEffect(() => {
    const loadFaqs = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const faqList = await faqApi.fetchFaqs(isAdmin);
        setFaqs(faqList);
      } catch (error) {
        console.error('FAQ 목록 가져오기 오류:', error);
        setError('FAQ 목록을 불러오는 중 오류가 발생했습니다.');
        setFaqs([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadFaqs();
  }, [isAdmin]);

  // FAQ 저장 처리
  const handleSaveFaq = async (faq: FaqItem) => {
    try {
      const savedFaq = await faqApi.saveFaq(faq);
      
      // 기존 FAQ 목록 업데이트
      const isNewItem = !faq.id;
      if (isNewItem) {
        setFaqs(prev => [...prev, savedFaq]);
        setSuccessMessage('새 게시물이 성공적으로 등록되었습니다.');
        
        // 새 게시물 작성 후 내 게시물 필터 자동 적용
        if (!showMyPostsOnly && savedFaq.author_id === currentUserEmail) {
          setShowMyPostsOnly(true);
          setAuthorFilter('me');
          setAppliedFilters(prev => ({
            ...prev,
            authorFilter: 'me'
          }));
        }
      } else {
        setFaqs(prev => prev.map(item => item.id === savedFaq.id ? savedFaq : item));
        setSuccessMessage('게시물이 성공적으로 수정되었습니다.');
      }
      
      // 성공 메시지 3초 후 자동으로 사라짐
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      
      setEditFaq(null);
      setShowEditModal(false);
    } catch (error) {
      console.error('FAQ 저장 오류:', error);
      setError('FAQ 저장 중 오류가 발생했습니다.');
    }
  };
  
  // FAQ 삭제 처리
  const handleDeleteFaq = async (id: string) => {
    // 삭제하려는 FAQ 찾기
    const faqToDelete = faqs.find(faq => faq.id === id);
    
    // 답변이 있는 문의글이면서 관리자가 아닌 경우 삭제 불가능
    if (faqToDelete && 
        faqToDelete.post_type === 'inquiry' && 
        faqToDelete.response && 
        !isAdmin && 
        faqToDelete.author_id === currentUserEmail) {
      alert('관리자가 이미 답변한 문의는 삭제할 수 없습니다.');
      return;
    }
    
    if (!window.confirm('정말로 이 게시물을 삭제하시겠습니까?')) {
      return;
    }
    
    try {
      await faqApi.deleteFaq(id);
      
      // 목록에서 삭제된 FAQ 제거
      setFaqs(prev => prev.filter(faq => faq.id !== id));
      setSuccessMessage('게시물이 성공적으로 삭제되었습니다.');
      
      // 성공 메시지 3초 후 자동으로 사라짐
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (error) {
      console.error('FAQ 삭제 오류:', error);
      setError('FAQ 삭제 중 오류가 발생했습니다.');
    }
  };

  // 필터 적용 함수
  const applyFilters = () => {
    setAppliedFilters({
      searchTerm,
      categoryFilter,
      serviceFilter,
      typeFilter,
      statusFilter,
      authorFilter
    });
  };

  // 필터 초기화 함수
  const resetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('');
    setServiceFilter('');
    setTypeFilter('');
    setStatusFilter('');
    setAuthorFilter('');
    setAppliedFilters({
      searchTerm: '',
      categoryFilter: '',
      serviceFilter: '',
      typeFilter: '',
      statusFilter: '',
      authorFilter: ''
    });
  };

  // 활성화된 필터 개수 계산
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (categoryFilter) count++;
    if (serviceFilter) count++;
    if (typeFilter) count++;
    if (statusFilter) count++;
    if (authorFilter) count++;
    return count;
  }, [searchTerm, categoryFilter, serviceFilter, typeFilter, statusFilter, authorFilter]);

  // 필터링된 FAQ 목록
  const filteredFaqs = useMemo(() => {
    // 사용자가 접근 가능한 서비스 ID 목록 추출
    const accessibleServiceIds = services.map(service => service.id);
    console.log('사용자가 접근 가능한 서비스 ID 목록:', accessibleServiceIds);
    
    return faqs.filter(faq => {
      // 검색어 필터링
      const matchesSearch = !appliedFilters.searchTerm || 
        faq.title.toLowerCase().includes(appliedFilters.searchTerm.toLowerCase()) ||
        faq.content.toLowerCase().includes(appliedFilters.searchTerm.toLowerCase());
      
      // 카테고리 필터링
      const matchesCategory = !appliedFilters.categoryFilter || faq.category === appliedFilters.categoryFilter;
      
      // 서비스 필터링
      const matchesService = !appliedFilters.serviceFilter || faq.service_id === appliedFilters.serviceFilter;
      
      // 게시물 유형 필터링
      const matchesType = !appliedFilters.typeFilter || faq.post_type === appliedFilters.typeFilter;
      
      // 상태 필터링
      const matchesStatus = !appliedFilters.statusFilter || faq.status === appliedFilters.statusFilter;
      
      // 작성자 필터링
      let matchesAuthor = true;
      if (appliedFilters.authorFilter) {
        if (appliedFilters.authorFilter === 'me') {
          // 내 게시물 필터링
          matchesAuthor = faq.author_id === currentUserEmail;
        } else {
          // 관리자만 특정 작성자로 필터링 가능
          matchesAuthor = isAdmin && faq.author_id === appliedFilters.authorFilter;
        }
      }
      
      // 접근 권한 필터링
      let hasAccess = true;
      
      if (!isAdmin) {
        // 공개되지 않은 항목은 보이지 않음
        if (!faq.is_published) return false;
        
        const userEmail = localStorage.getItem('userEmail') || '';
        
        // 1. 본인이 작성한 질의는 항상 볼 수 있음
        if (faq.post_type === 'inquiry' && faq.author_id === userEmail) {
          hasAccess = true;
        }
        // 2. 서비스 ID가 없는 FAQ/공지사항은 모든 사용자가 볼 수 있음
        else if (!faq.service_id && (faq.post_type === 'faq' || faq.post_type === 'notice')) {
          hasAccess = true;
        }
        // 3. 사용자가 접근 가능한 서비스의 모든 FAQ, 공지사항, 질의를 볼 수 있음
        else if (faq.service_id && accessibleServiceIds.includes(faq.service_id)) {
          hasAccess = true;
        }
        // 4. 그 외의 경우 접근 불가
        else {
          hasAccess = false;
        }
      }
      
      return matchesSearch && matchesCategory && matchesService && matchesType && matchesStatus && matchesAuthor && hasAccess;
    });
  }, [faqs, appliedFilters, isAdmin, services, currentUserEmail]);

  // 고유한 카테고리 및 작성자 목록 (필터링용)
  const categories = useMemo(() => {
    return Array.from(new Set(faqs.map(faq => faq.category)));
  }, [faqs]);
  
  const authors = useMemo(() => {
    return Array.from(new Set(faqs.map(faq => faq.author_id)));
  }, [faqs]);

  // 게시판 제목 생성 함수
  const getBoardTitle = () => {
    if (appliedFilters.typeFilter === 'faq') return 'FAQ';
    if (appliedFilters.typeFilter === 'notice') return '공지사항';
    if (appliedFilters.typeFilter === 'inquiry') return '서비스 문의';
    return '전체 게시판';
  };

  // 새 게시물 작성 처리
  const handleAddNewItem = () => {
    // 현재 사용자 정보 가져오기 - currentUserEmail 사용
    const userEmail = currentUserEmail || localStorage.getItem('email') || '';
    const userName = userEmail.split('@')[0] || '';
    
    // 관리자 여부에 따라 기본 게시물 유형 설정
    const defaultPostType = isAdmin ? (typeFilter || 'faq') : 'inquiry';
    
    // 새 게시물 객체 생성
    const newItem: FaqItem = {
      id: '',
      title: '',
      content: '',
      category: categoryFilter || '서비스',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_published: true,
      service_id: serviceFilter || '',
      author: userEmail, // 이메일을 작성자 이름으로 사용
      author_id: userEmail, // 이메일을 작성자 ID로 사용 (이전에는 userName이었음)
      post_type: defaultPostType as 'faq' | 'notice' | 'inquiry',
      status: defaultPostType === 'inquiry' ? 'pending' : 'not_applicable',
      response: ''
    };
    
    console.log('새 게시물 작성:', newItem);
    
    // 편집 모달 열기
    setEditFaq(newItem);
    setShowEditModal(true);
  };

  // useEffect를 추가하여 authorFilter가 'me'로 설정되면 showMyPostsOnly 상태도 업데이트
  useEffect(() => {
    if (appliedFilters.authorFilter === 'me') {
      setShowMyPostsOnly(true);
    } else {
      setShowMyPostsOnly(false);
    }
  }, [appliedFilters.authorFilter]);

  return (
    <div className="faq-board">
      <div className="flex flex-wrap justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{getBoardTitle()}</h2>
        
        <div className="flex gap-2">
          <button
            onClick={() => {
              const newValue = !showMyPostsOnly;
              setShowMyPostsOnly(newValue);
              if (newValue) {
                setAuthorFilter('me');
                setAppliedFilters(prev => ({
                  ...prev,
                  authorFilter: 'me'
                }));
              } else {
                setAuthorFilter('');
                setAppliedFilters(prev => ({
                  ...prev,
                  authorFilter: ''
                }));
              }
            }}
            className={`mb-2 ${showMyPostsOnly ? 'bg-indigo-700' : 'bg-indigo-500 hover:bg-indigo-700'} text-white font-bold py-2 px-4 rounded flex items-center`}
          >
            {showMyPostsOnly ? '모든 게시물 보기' : '내 게시물만 보기'}
          </button>
          <button
            onClick={handleAddNewItem}
            className={`mb-2 ${isAdmin ? 'bg-blue-500 hover:bg-blue-700' : 'bg-amber-500 hover:bg-amber-700'} text-white font-bold py-2 px-4 rounded flex items-center`}
          >
            <FaPlus className="mr-2" /> 
            {isAdmin ? '항목 추가' : '질문하기'}
          </button>
        </div>
      </div>
      
      {successMessage && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md">
          {successMessage}
        </div>
      )}
      
      {/* 검색 및 필터링 영역 */}
      <div className="bg-white shadow-md rounded-lg mb-6 overflow-hidden border border-gray-200">
        {/* 검색바 */}
        <div className="p-4 flex items-center gap-4 border-b border-gray-200">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaSearch className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="검색어를 입력하세요..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </div>
          <button
            onClick={applyFilters}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            검색
          </button>
          <button
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <span>필터</span>
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-white bg-blue-500 rounded-full">
                {activeFiltersCount}
              </span>
            )}
            <svg
              className={`w-5 h-5 transition-transform ${isFilterExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        
        {/* 확장 필터 영역 */}
        {isFilterExpanded && (
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">게시물 유형</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="">모든 유형</option>
                  {POST_TYPE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">모든 카테고리</option>
                  {categories.filter(cat => cat !== '').map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">관련 서비스</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                >
                  <option value="">모든 서비스</option>
                  {services.map(service => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {(isAdmin || typeFilter === 'inquiry') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">처리 상태</label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">모든 상태</option>
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">작성자</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                >
                  <option value="">모든 작성자</option>
                  <option value="me">내 게시물</option>
                  {isAdmin && authors.filter(a => a !== '').map(author => (
                    <option key={author} value={author}>{faqs.find(f => f.author_id === author)?.author || author}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={resetFilters}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
              >
                필터 초기화
              </button>
              <button
                onClick={applyFilters}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                필터 적용
              </button>
            </div>
          </div>
        )}
        
        {/* 적용된 필터 태그 */}
        {(appliedFilters.searchTerm || appliedFilters.categoryFilter || appliedFilters.serviceFilter || 
          appliedFilters.typeFilter || appliedFilters.statusFilter || appliedFilters.authorFilter) && (
          <div className="px-4 py-3 bg-gray-50 flex flex-wrap gap-2 items-center">
            <span className="text-sm text-gray-600">적용된 필터:</span>
            
            {appliedFilters.searchTerm && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                검색어: {appliedFilters.searchTerm}
              </span>
            )}
            
            {appliedFilters.typeFilter && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                유형: {getPostTypeLabel(appliedFilters.typeFilter)}
              </span>
            )}
            
            {appliedFilters.categoryFilter && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                카테고리: {appliedFilters.categoryFilter}
              </span>
            )}
            
            {appliedFilters.serviceFilter && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                서비스: {services.find(s => s.id === appliedFilters.serviceFilter)?.name || appliedFilters.serviceFilter}
              </span>
            )}
            
            {appliedFilters.statusFilter && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                상태: {getStatusLabel(appliedFilters.statusFilter)}
              </span>
            )}
            
            {appliedFilters.authorFilter && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                작성자: {appliedFilters.authorFilter === 'me' ? '내 게시물' : (faqs.find(f => f.author_id === appliedFilters.authorFilter)?.author || appliedFilters.authorFilter)}
              </span>
            )}
            
            <button
              onClick={resetFilters}
              className="ml-2 text-sm text-gray-600 hover:text-gray-900"
            >
              모두 지우기
            </button>
          </div>
        )}
      </div>
      
      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : filteredFaqs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {(appliedFilters.searchTerm || appliedFilters.categoryFilter || appliedFilters.serviceFilter || 
            appliedFilters.typeFilter || appliedFilters.statusFilter || appliedFilters.authorFilter) 
              ? '검색 결과가 없습니다.' 
              : '게시물이 없습니다.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">제목</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">유형</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">카테고리</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">관련 서비스</th>
                {(isAdmin || appliedFilters.typeFilter === 'inquiry') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작성자</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">업데이트</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">액션</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredFaqs.map(faq => (
                <tr 
                  key={faq.id}
                  className={`${faq.author_id === currentUserEmail ? 'bg-yellow-50 hover:bg-yellow-100' : 'bg-white hover:bg-gray-50'}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`text-sm ${faq.author_id === currentUserEmail ? 'font-bold text-blue-900' : 'font-medium text-gray-900'}`}>
                        {faq.title}
                      </div>
                      {faq.author_id === currentUserEmail && (
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                          내 게시물
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${faq.post_type === 'faq' ? 'bg-blue-100 text-blue-800' : 
                        faq.post_type === 'notice' ? 'bg-purple-100 text-purple-800' : 
                        'bg-yellow-100 text-yellow-800'}`}>
                      {getPostTypeLabel(faq.post_type)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{faq.category}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {faq.service_id ? services.find(s => s.id === faq.service_id)?.name || '없음' : '없음'}
                    </div>
                  </td>
                  {(isAdmin || appliedFilters.typeFilter === 'inquiry') && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      {faq.post_type === 'inquiry' && (
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                          ${faq.status === 'pending' ? 'bg-red-100 text-red-800' : 
                            faq.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' : 
                            faq.status === 'completed' ? 'bg-green-100 text-green-800' : 
                            'bg-gray-100 text-gray-800'}`}>
                          {getStatusLabel(faq.status)}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{faq.author || '익명'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {new Date(faq.updated_at).toLocaleDateString('ko-KR')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      className="text-blue-600 hover:text-blue-900 mr-3"
                      onClick={() => {
                        setViewFaq(faq);
                        setShowViewModal(true);
                      }}
                      title="상세 내용 보기"
                    >
                      <FaEye />
                    </button>
                    
                    {/* 관리자거나, 작성자이면서 아직 답변이 없는 경우에만 수정/삭제 버튼 표시 */}
                    {(isAdmin || (faq.author_id === currentUserEmail && !(faq.post_type === 'inquiry' && faq.response))) && (
                      <>
                        <button
                          className="text-green-600 hover:text-green-900 mr-3"
                          onClick={() => {
                            // 답변이 있는 문의글이면서 관리자가 아닌 경우 수정 불가능
                            if (faq.post_type === 'inquiry' && 
                                faq.response && 
                                !isAdmin && 
                                faq.author_id === currentUserEmail) {
                              alert('관리자가 이미 답변한 문의는 수정할 수 없습니다.');
                              return;
                            }
                            
                            setEditFaq(faq);
                            setShowEditModal(true);
                          }}
                          title="수정하기"
                        >
                          <FaEdit />
                        </button>
                        <button
                          className="text-red-600 hover:text-red-900"
                          onClick={() => handleDeleteFaq(faq.id)}
                          title="삭제하기"
                        >
                          <FaTrash />
                        </button>
                      </>
                    )}
                    
                    {/* 작성자이지만 이미 답변이 있는 경우 안내 메시지 표시 */}
                    {faq.author_id === currentUserEmail && faq.post_type === 'inquiry' && faq.response && (
                      <span className="text-xs text-gray-500 ml-2" title="관리자가 이미 답변한 문의는 수정/삭제할 수 없습니다">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="hidden sm:inline ml-1">답변완료</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* FAQ 보기 모달 */}
      {viewFaq && (
        <FaqViewModal
          faq={viewFaq}
          isOpen={showViewModal}
          onClose={() => {
            setViewFaq(null);
            setShowViewModal(false);
          }}
          services={services}
        />
      )}
      
      {/* FAQ 편집 모달 */}
      {editFaq && (
        <FaqEditModal
          faq={editFaq}
          isOpen={showEditModal}
          onClose={() => {
            setEditFaq(null);
            setShowEditModal(false);
          }}
          onSave={handleSaveFaq}
          services={services}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
};

export default FaqBoard; 