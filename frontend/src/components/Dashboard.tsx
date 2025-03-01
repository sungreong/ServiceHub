import React, { useState, useEffect, useMemo } from 'react';
import instance from '../api/axios';  // 명시적으로 instance로 이름 변경
import axios from 'axios';  // 기본 axios 추가
import { useNavigate } from 'react-router-dom';
import { FaStar, FaRegStar, FaEye, FaExternalLinkAlt, FaEdit, FaTrash, FaChartLine, FaSync } from 'react-icons/fa';
import Monitoring from './Monitoring';
import { recordServiceAccess, sendHeartbeat, endServiceAccess } from '../api/monitoring';

interface Service {
    id: string;
    name: string;
    description: string;
    url: string;  // IP:PORT 대신 URL 사용
    nginx_url?: string;
    show_info: boolean;
    protocol: string;
    host: string;
    port?: number;  // 포트는 선택적
    base_path?: string;
    is_favorite?: boolean; // 즐겨찾기 여부
    group_id?: string | null; // 그룹 ID (null 값 허용)
}

interface ServiceStatus {
    access: 'available' | 'unavailable';
    running: 'online' | 'offline';
}

interface ServiceGroup {
    id: string;
    name: string;
    description?: string;
    created_at?: string;
}

// EditServiceModal 컴포넌트 추가
interface EditServiceModalProps {
    service: Service | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (service: Service) => Promise<void>;
}

const EditServiceModal = ({ service, isOpen, onClose, onSave }: EditServiceModalProps) => {
    const [formData, setFormData] = useState<Service | null>(null);
    const [error, setError] = useState('');
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [groups, setGroups] = useState<ServiceGroup[]>([]);

    useEffect(() => {
        if (service) {
            setFormData({ ...service });
            setIsDescriptionExpanded(false);
            fetchGroups();
        }
    }, [service]);

    const fetchGroups = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 백엔드 API가 구현되어 있다고 가정
            const response = await instance.get('/service-groups', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data) {
                setGroups(response.data);
            }
        } catch (err) {
            console.error('Failed to fetch service groups:', err);
            // 임시 그룹 데이터 (백엔드 API가 없는 경우)
            setGroups([
                { id: 'group_1', name: '개발 서비스', description: '개발 관련 서비스 모음', created_at: new Date().toISOString() },
                { id: 'group_2', name: '운영 서비스', description: '운영 관련 서비스 모음', created_at: new Date().toISOString() },
                { id: 'group_3', name: '테스트 서비스', description: '테스트용 서비스 모음', created_at: new Date().toISOString() }
            ]);
        }
    };

    if (!isOpen || !formData) return null;

    // formData.description이 null이나 undefined인 경우 빈 문자열로 처리
    const safeDescription = formData.description || "";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await onSave(formData);
            onClose();
        } catch (err) {
            setError('서비스 수정 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-2xl w-full">
                <h2 className="text-2xl font-bold mb-6">서비스 수정</h2>
                {error && (
                    <div className="mb-4 p-3 bg-red-100 text-red-600 rounded">
                        {error}
                    </div>
                )}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            서비스 이름
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full p-2 border rounded"
                            required
                        />
                    </div>
                    <div className="mb-8 relative">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            설명
                        </label>
                        <div className="relative">
                            <textarea
                                value={safeDescription}
                                onChange={(e) => {
                                    const newValue = e.target.value;
                                    if (newValue.length <= 500) {
                                        setFormData({ ...formData, description: newValue });
                                    }
                                }}
                                className={`w-full p-3 border rounded transition-all duration-200 resize-none ${
                                    isDescriptionExpanded ? 'h-64' : 'h-24'
                                }`}
                                style={{
                                    lineHeight: '1.5',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    overflowY: 'auto',
                                    marginBottom: '2rem'
                                }}
                                placeholder="서비스에 대한 설명을 입력하세요..."
                                required
                            />
                        </div>
                        <div className="absolute bottom-0 right-0 flex items-center space-x-2 bg-white p-1 rounded shadow-sm">
                            <span className="text-sm text-gray-500">
                                {safeDescription.length}/500자
                            </span>
                            {safeDescription.length > 100 && (
                                <button
                                    type="button"
                                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                    className="text-blue-500 hover:text-blue-700 text-sm bg-white px-2 py-1 rounded border"
                                >
                                    {isDescriptionExpanded ? '접기' : '더보기'}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            URL
                        </label>
                        <input
                            type="text"
                            value={formData.url}
                            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                            className="w-full p-2 border rounded"
                            required
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            그룹
                        </label>
                        <select
                            value={formData.group_id || ''}
                            onChange={(e) => setFormData({ ...formData, group_id: e.target.value || null })}
                            className="w-full p-2 border rounded"
                        >
                            <option value="">그룹 없음</option>
                            {groups.map(group => (
                                <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="mb-4">
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={formData.show_info}
                                onChange={(e) => setFormData({ ...formData, show_info: e.target.checked })}
                                className="mr-2"
                            />
                            <span className="text-gray-700 text-sm font-bold">URL 정보 표시</span>
                        </label>
                    </div>
                    <div className="flex justify-end gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:text-gray-800"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                            저장
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// TruncatedText 컴포넌트 수정
interface TruncatedTextProps {
    text: string;
    maxLength?: number;
    maxLines?: number;
    className?: string;
}

const TruncatedText = ({ text, maxLength = 50, maxLines = 2, className = "" }: TruncatedTextProps) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // text가 null이나 undefined인 경우 빈 문자열로 처리
    const safeText = text || "";
    
    // 5글자 이상인 경우에만 truncate 적용
    const shouldTruncate = safeText.length > 5;

    if (!shouldTruncate) {
        return <span className={className}>{safeText}</span>;
    }

    // 축소된 상태일 때 표시할 텍스트
    const truncatedText = isExpanded ? safeText : `${safeText.substring(0, maxLength)}${safeText.length > maxLength ? '...' : ''}`;

    return (
        <div className={`relative ${className}`}>
            <div
                className={`${
                    isExpanded ? '' : `line-clamp-${maxLines}`
                } break-words whitespace-pre-wrap cursor-pointer`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {truncatedText}
            </div>
            {shouldTruncate && (
            <button
                onClick={(e) => {
                    e.stopPropagation();  // 이벤트 버블링 방지
                    setIsExpanded(!isExpanded);
                }}
                className="text-blue-500 hover:text-blue-700 text-sm mt-1"
            >
                {isExpanded ? '접기' : '더보기'}
            </button>
            )}
        </div>
    );
};

// ServiceDetailModal 컴포넌트 추가
interface ServiceDetailModalProps {
    service: Service | null;
    isOpen: boolean;
    onClose: () => void;
}

const ServiceDetailModal = ({ service, isOpen, onClose }: ServiceDetailModalProps) => {
    const [groups, setGroups] = useState<ServiceGroup[]>([]);

    useEffect(() => {
        if (isOpen && service) {
            fetchGroups();
        }
    }, [isOpen, service]);

    const fetchGroups = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 백엔드 API가 구현되어 있다고 가정
            const response = await instance.get('/service-groups', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data) {
                setGroups(response.data);
            }
        } catch (err) {
            console.error('Failed to fetch service groups:', err);
            // 임시 그룹 데이터 (백엔드 API가 없는 경우)
            setGroups([
                { id: 'group_1', name: '개발 서비스', description: '개발 관련 서비스 모음', created_at: new Date().toISOString() },
                { id: 'group_2', name: '운영 서비스', description: '운영 관련 서비스 모음', created_at: new Date().toISOString() },
                { id: 'group_3', name: '테스트 서비스', description: '테스트용 서비스 모음', created_at: new Date().toISOString() }
            ]);
        }
    };

    if (!isOpen || !service) return null;

    // 그룹 이름 찾기
    const groupName = service.group_id 
        ? groups.find(g => g.id === service.group_id)?.name || service.group_id
        : null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-2xl w-full">
                <div className="flex justify-between items-start mb-6">
                    <h2 className="text-2xl font-bold">서비스 상세 정보</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold mb-2">서비스 이름</h3>
                        <p className="text-gray-700">{service.name}</p>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-2">설명</h3>
                        <p className="text-gray-700 whitespace-pre-wrap">{service.description}</p>
                    </div>
                    {service.show_info && (
                    <div>
                        <h3 className="text-lg font-semibold mb-2">URL</h3>
                        <p className="text-gray-700">{service.url}</p>
                    </div>
                    )}
                    {groupName && (
                        <div>
                            <h3 className="text-lg font-semibold mb-2">그룹</h3>
                            <span className="px-2 py-1 text-sm rounded-full bg-blue-100 text-blue-800">
                                {groupName}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ViewToggleButton 컴포넌트 추가
interface ViewToggleButtonProps {
    isTableView: boolean;
    onToggle: () => void;
}

const ViewToggleButton = ({ isTableView, onToggle }: ViewToggleButtonProps) => {
    return (
        <button
            onClick={onToggle}
            className="flex items-center space-x-2 px-4 py-2 bg-white border rounded-lg shadow-sm hover:bg-gray-50"
        >
            {isTableView ? (
                <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    <span>목록형 보기</span>
                </>
            ) : (
                <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18M3 18h18M3 6h18" />
                    </svg>
                    <span>테이블형 보기</span>
                </>
            )}
        </button>
    );
};

// AdminServiceList 컴포넌트 추가
const AdminServiceList = ({ 
    services, 
    onDelete, 
    servicesStatus,
    onServiceClick,
    onEditService,
    getStatusIndicator,
    onViewService,
    onAssignGroup
}: { 
    services: Service[], 
    onDelete: (ids: string[]) => void,
    servicesStatus: {[key: string]: ServiceStatus},
    onServiceClick: (service: Service) => void,
    onEditService: (service: Service) => void,
    getStatusIndicator: (serviceId: string) => React.ReactNode,
    onViewService: (service: Service) => void,
    onAssignGroup: (serviceId: string, groupId: string | null) => Promise<void>
}) => {
    const [groups, setGroups] = useState<ServiceGroup[]>([]);

    useEffect(() => {
        fetchGroups();
    }, []);

    const fetchGroups = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 백엔드 API가 구현되어 있다고 가정
            const response = await instance.get('/service-groups', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data) {
                setGroups(response.data);
            }
        } catch (err) {
            console.error('Failed to fetch service groups:', err);
            // 임시 그룹 데이터 (백엔드 API가 없는 경우)
            setGroups([
                { id: 'group_1', name: '개발 서비스', description: '개발 관련 서비스 모음', created_at: new Date().toISOString() },
                { id: 'group_2', name: '운영 서비스', description: '운영 관련 서비스 모음', created_at: new Date().toISOString() },
                { id: 'group_3', name: '테스트 서비스', description: '테스트용 서비스 모음', created_at: new Date().toISOString() }
            ]);
        }
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {services.map((service) => (
                <div
                    key={service.id}
                    className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden"
                >
                    <div className="p-4 md:p-6">
                        <div className="flex justify-between items-start mb-3">
                            <h3 className="text-base font-semibold flex-grow pr-2">
                                <TruncatedText text={service.name} maxLength={30} maxLines={1} />
                            </h3>
                            {getStatusIndicator(service.id)}
                        </div>
                        <div className="mb-4 min-h-[4.5rem] text-sm">
                            <TruncatedText text={service.description} maxLength={200} maxLines={3} />
                        </div>
                        <div className="mb-4 text-xs text-gray-500">
                            <TruncatedText text={service.url} maxLength={100} maxLines={2} />
                        </div>
                        
                        {/* 그룹 선택 드롭다운 추가 */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">그룹 할당</label>
                            <select
                                value={service.group_id || ''}
                                onChange={(e) => onAssignGroup(service.id, e.target.value || null)}
                                className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <option value="">그룹 없음</option>
                                {groups.map(group => (
                                    <option key={group.id} value={group.id}>{group.name}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 justify-end mt-4">
                            <button
                                onClick={() => onViewService(service)}
                                className="p-2 text-gray-600 hover:text-gray-800 rounded-md hover:bg-gray-50 transition-colors group relative"
                                title="상세보기"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                                    상세보기
                                </span>
                            </button>
                            <button
                                onClick={() => onServiceClick(service)}
                                disabled={!servicesStatus[service.id] || servicesStatus[service.id].running === 'offline'}
                                className={`p-2 rounded-md transition-colors group relative ${
                                    servicesStatus[service.id]?.running === 'online'
                                        ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                                        : 'text-gray-400 cursor-not-allowed'
                                }`}
                                title={servicesStatus[service.id]?.running === 'online' ? '접속하기' : '접속불가'}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                                    {servicesStatus[service.id]?.running === 'online' ? '접속하기' : '접속불가'}
                                </span>
                            </button>
                            <button
                                onClick={() => onEditService(service)}
                                className="p-2 text-green-600 hover:text-green-700 rounded-md hover:bg-green-50 transition-colors group relative"
                                title="수정"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                                    수정
                                </span>
                            </button>
                            <button
                                onClick={() => onDelete([service.id])}
                                className="p-2 text-red-600 hover:text-red-700 rounded-md hover:bg-red-50 transition-colors group relative"
                                title="삭제"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                                    삭제
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

// AdminServiceTable 컴포넌트 수정
const AdminServiceTable = ({ 
    services, 
    onDelete, 
    servicesStatus,
    onServiceClick,
    onEditService,
    getStatusIndicator,
    onAssignGroup
}: { 
    services: Service[], 
    onDelete: (ids: string[]) => void,
    servicesStatus: {[key: string]: ServiceStatus},
    onServiceClick: (service: Service) => void,
    onEditService: (service: Service) => void,
    getStatusIndicator: (serviceId: string) => React.ReactNode,
    onAssignGroup: (serviceId: string, groupId: string | null) => Promise<void>
}) => {
    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [selectAll, setSelectAll] = useState(false);
    const [viewingService, setViewingService] = useState<Service | null>(null);
    const [groups, setGroups] = useState<ServiceGroup[]>([]);

    useEffect(() => {
        fetchGroups();
    }, []);

    const fetchGroups = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 백엔드 API가 구현되어 있다고 가정
            const response = await instance.get('/service-groups', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data) {
                setGroups(response.data);
            }
        } catch (err) {
            console.error('Failed to fetch service groups:', err);
            // 임시 그룹 데이터 (백엔드 API가 없는 경우)
            setGroups([
                { id: 'group_1', name: '개발 서비스', description: '개발 관련 서비스 모음', created_at: new Date().toISOString() },
                { id: 'group_2', name: '운영 서비스', description: '운영 관련 서비스 모음', created_at: new Date().toISOString() },
                { id: 'group_3', name: '테스트 서비스', description: '테스트용 서비스 모음', created_at: new Date().toISOString() }
            ]);
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedServices(services.map(service => service.id));
            setSelectAll(true);
        } else {
            setSelectedServices([]);
            setSelectAll(false);
        }
    };

    const handleSelect = (serviceId: string) => {
        setSelectedServices(prev => {
            if (prev.includes(serviceId)) {
                return prev.filter(id => id !== serviceId);
            } else {
                return [...prev, serviceId];
            }
        });
    };

    const handleDelete = () => {
        if (window.confirm('선택한 서비스를 삭제하시겠습니까?')) {
            onDelete(selectedServices);
            setSelectedServices([]);
            setSelectAll(false);
        }
    };

    // handleAssignGroup 함수 수정
    const handleAssignGroup = async (serviceId: string, groupId: string | null) => {
        // onAssignGroup prop을 호출하여 Dashboard 컴포넌트의 함수 사용
        await onAssignGroup(serviceId, groupId);
    };

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-4 md:p-6 border-b">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">서비스 관리</h2>
                    {selectedServices.length > 0 && (
                        <button
                            onClick={handleDelete}
                            className="inline-flex items-center px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm"
                        >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            선택 삭제 ({selectedServices.length})
                        </button>
                    )}
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="w-12 px-4 py-3">
                                <input
                                    type="checkbox"
                                    checked={selectAll}
                                    onChange={handleSelectAll}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">이름</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">URL</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">상태</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">그룹</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700">작업</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-sm">
                        {services.map((service) => (
                            <tr key={service.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={selectedServices.includes(service.id)}
                                        onChange={() => handleSelect(service.id)}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                </td>
                                <td className="px-4 py-3 max-w-[200px]">
                                    <TruncatedText text={service.name} maxLength={30} maxLines={1} />
                                </td>
                                <td className="px-4 py-3 max-w-[300px]">
                                    <TruncatedText text={service.url} maxLength={60} maxLines={1} />
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    {getStatusIndicator(service.id)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <select
                                        value={service.group_id || ''}
                                        onChange={(e) => handleAssignGroup(service.id, e.target.value || null)}
                                        className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <option value="">그룹 없음</option>
                                        {groups.map(group => (
                                            <option key={group.id} value={group.id}>{group.name}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setViewingService(service)}
                                            className="p-1.5 text-gray-600 hover:text-gray-800 rounded-md hover:bg-gray-100 transition-colors group relative"
                                            title="상세보기"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                                                상세보기
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => onServiceClick(service)}
                                            disabled={!servicesStatus[service.id] || servicesStatus[service.id].running === 'offline'}
                                            className={`p-1.5 rounded-md transition-colors group relative ${
                                                servicesStatus[service.id]?.running === 'online'
                                                    ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                                                    : 'text-gray-400 cursor-not-allowed'
                                            }`}
                                            title={servicesStatus[service.id]?.running === 'online' ? '접속하기' : '접속불가'}
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                            </svg>
                                            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                                                {servicesStatus[service.id]?.running === 'online' ? '접속하기' : '접속불가'}
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => onEditService(service)}
                                            className="p-1.5 text-green-600 hover:text-green-700 rounded-md hover:bg-green-50 transition-colors group relative"
                                            title="수정"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                                                수정
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => onDelete([service.id])}
                                            className="p-1.5 text-red-600 hover:text-red-700 rounded-md hover:bg-red-50 transition-colors group relative"
                                            title="삭제"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                                                삭제
                                            </span>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <ServiceDetailModal
                service={viewingService}
                isOpen={!!viewingService}
                onClose={() => setViewingService(null)}
            />
        </div>
    );
};

interface GroupModalProps {
    group: ServiceGroup | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (group: ServiceGroup) => Promise<boolean | void>;
}

const GroupModal = ({ group, isOpen, onClose, onSave }: GroupModalProps) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (group) {
            setName(group.name || '');
            setDescription(group.description || '');
        } else {
            setName('');
            setDescription('');
        }
        setError('');
    }, [group, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!name.trim()) {
            setError('그룹 이름을 입력해주세요.');
            return;
        }
        
        try {
            const updatedGroup: ServiceGroup = {
                id: group?.id || `group_${Date.now()}`,
                name,
                description,
                created_at: group?.created_at || new Date().toISOString()
            };
            
            await onSave(updatedGroup);
            onClose();
        } catch (err: any) {
            console.error('Failed to save group:', err);
            setError(err.message || '그룹 저장 중 오류가 발생했습니다.');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        {group ? '그룹 수정' : '새 그룹 생성'}
                    </h2>
                    
                    <form onSubmit={handleSubmit}>
                        {error && (
                            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
                                {error}
                            </div>
                        )}
                        
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                그룹 이름
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md"
                                placeholder="그룹 이름을 입력하세요"
                            />
                        </div>
                        
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                설명 (선택사항)
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md"
                                placeholder="그룹에 대한 설명을 입력하세요"
                                rows={3}
                            />
                        </div>
                        
                        <div className="flex justify-end space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700"
                            >
                                저장
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

// 사용자용 서비스 테이블 컴포넌트
const UserServiceTable = ({ 
    services, 
    servicesStatus,
    onServiceClick,
    getStatusIndicator,
    onViewService,
    onToggleFavorite,
    onAssignGroup,
    groups
}: { 
    services: Service[], 
    servicesStatus: {[key: string]: ServiceStatus},
    onServiceClick: (service: Service) => void,
    getStatusIndicator: (serviceId: string) => React.ReactNode,
    onViewService: (service: Service) => void,
    onToggleFavorite: (service: Service) => void,
    onAssignGroup: (serviceId: string, groupId: string | null) => Promise<void>,
    groups: ServiceGroup[]
}) => {
    // 중복된 groups 상태 제거
    // const [groups, setGroups] = useState<ServiceGroup[]>([]);
    
    // 서비스 URL 열기 함수
    const openServiceUrl = async (service: Service) => {
        try {
            // 서비스 접속 기록
            console.log(`[DEBUG] 서비스 접속 기록 시작: ${service.id}`);
            const accessRecord = await recordServiceAccess(service.id);
            const sessionId = accessRecord?.session_id;
            
            // 서비스 접근 권한 확인
            const response = await instance.get(`/services/verify-service-access?serviceId=${service.id}`);
            if (response.data.allowed) {
                // 항상 Nginx 라우트 사용
                const nginxUrl = `/api/${service.id}/`;
                
                // URL이 유효한지 확인
                if (nginxUrl && nginxUrl !== '/') {
                    // URL이 상대 경로인 경우 REACT_APP_NGINX_URL 환경 변수를 사용
                    const baseUrl = process.env.REACT_APP_NGINX_URL || '';
                    const fullUrl = `${baseUrl}${nginxUrl}`;
                    console.log(`[DEBUG] 서비스 URL 열기: ${fullUrl}`);
                    
                    // 새 창에서 열기
                    const newWindow = window.open(fullUrl, '_blank');
                    
                    // 새 창이 닫힐 때 세션 종료를 감지하기 위한 폴링
                    if (newWindow && sessionId) {
                        const checkWindowClosed = setInterval(() => {
                            if (newWindow.closed) {
                                clearInterval(checkWindowClosed);
                                // 세션 종료 기록
                                endServiceAccess(sessionId);
                            }
                        }, 1000);
                        
                        // 5분마다 하트비트 전송 (창이 열려있는 동안)
                        const heartbeatInterval = setInterval(() => {
                            if (newWindow.closed) {
                                clearInterval(heartbeatInterval);
                            } else {
                                sendHeartbeat(sessionId);
                            }
                        }, 300000); // 5분 = 300,000ms
                    }
                } else {
                    alert('유효하지 않은 URL입니다.');
                }
            } else {
                alert('서비스에 접근 권한이 없습니다.');
            }
        } catch (error) {
            console.error('서비스 접근 중 오류 발생:', error);
            alert('서비스 접근 중 오류가 발생했습니다.');
        }
    };
    
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
                <thead>
                    <tr className="bg-gray-100 text-gray-600 uppercase text-sm leading-normal">
                        <th className="py-3 px-6 text-left">서비스명</th>
                        <th className="py-3 px-6 text-left">설명</th>
                        <th className="py-3 px-6 text-left">상태</th>
                        <th className="py-3 px-6 text-left">그룹</th>
                        <th className="py-3 px-6 text-center">액션</th>
                    </tr>
                </thead>
                <tbody className="text-gray-600 text-sm">
                    {services.map(service => (
                        <tr key={service.id} className="border-b border-gray-200 hover:bg-gray-100">
                            <td className="py-3 px-6 text-left">
                                <div className="flex items-center">
                                    <span 
                                        className="cursor-pointer font-medium"
                                        onClick={() => onServiceClick(service)}
                                    >
                                        {service.name}
                                    </span>
                                    <button 
                                        onClick={() => onToggleFavorite(service)}
                                        className="ml-2 text-yellow-500 hover:text-yellow-700"
                                    >
                                        {service.is_favorite ? <FaStar /> : <FaRegStar />}
                                    </button>
                                </div>
                            </td>
                            <td className="py-3 px-6 text-left">
                                <TruncatedText text={service.description || ""} maxLength={10} maxLines={1} />
                            </td>
                            <td className="py-3 px-6 text-left">
                                {getStatusIndicator(service.id)}
                            </td>
                            <td className="py-3 px-6 text-left">
                                <select
                                    className="border rounded px-2 py-1 text-sm"
                                    value={service.group_id || ""}
                                    onChange={(e) => onAssignGroup(service.id, e.target.value === "" ? null : e.target.value)}
                                >
                                    <option value="">그룹 없음</option>
                                    {groups.map(group => (
                                        <option key={group.id} value={group.id}>
                                            {group.name}
                                        </option>
                                    ))}
                                </select>
                            </td>
                            <td className="py-3 px-6 text-center">
                                <div className="flex item-center justify-center">
                                    <button
                                        onClick={() => onViewService(service)}
                                        className="transform hover:text-blue-500 hover:scale-110 transition-all duration-150 mr-3"
                                    >
                                        <FaEye />
                                    </button>
                                    <button
                                        onClick={() => openServiceUrl(service)}
                                        className="transform hover:text-green-500 hover:scale-110 transition-all duration-150"
                                        title="서비스 열기"
                                    >
                                        <FaExternalLinkAlt />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// 사용자용 서비스 타일 뷰 컴포넌트
const UserServiceList = ({ 
    services, 
    servicesStatus,
    onServiceClick,
    getStatusIndicator,
    onViewService,
    onToggleFavorite,
    onAssignGroup,
    groups
}: { 
    services: Service[], 
    servicesStatus: {[key: string]: ServiceStatus},
    onServiceClick: (service: Service) => void,
    getStatusIndicator: (serviceId: string) => React.ReactNode,
    onViewService: (service: Service) => void,
    onToggleFavorite: (service: Service) => void,
    onAssignGroup: (serviceId: string, groupId: string | null) => Promise<void>,
    groups: ServiceGroup[]
}) => {
    // 중복된 groups 상태 제거
    // const [groups, setGroups] = useState<ServiceGroup[]>([]);
    
    // 서비스 URL 열기 함수
    const openServiceUrl = async (service: Service) => {
        try {
            // 서비스 접속 기록
            const accessRecord = await recordServiceAccess(service.id);
            const sessionId = accessRecord?.session_id;
            
            // 서비스 접근 권한 확인
            const response = await instance.get(`/services/verify-service-access?serviceId=${service.id}`);
            if (response.data.allowed) {
                // nginx_url이 있으면 사용, 없으면 기본 URL 사용
                const serviceUrl = service.nginx_url || `/api/${service.id}/`;
                
                // URL이 유효한지 확인
                if (serviceUrl && serviceUrl !== '/') {
                    // URL이 상대 경로인 경우 REACT_APP_NGINX_URL 환경 변수를 사용
                    let fullUrl = '';
                    if (serviceUrl.startsWith('/')) {
                        const baseUrl = process.env.REACT_APP_NGINX_URL || '';
                        fullUrl = `${baseUrl}${serviceUrl}`;
                        console.log(`[DEBUG] 서비스 URL 열기: ${fullUrl}`);
                    } else {
                        // 절대 URL인 경우 그대로 사용
                        fullUrl = serviceUrl;
                        console.log(`[DEBUG] 서비스 URL 열기: ${fullUrl}`);
                    }
                    
                    // 새 창 열기
                    const newWindow = window.open(fullUrl, '_blank');
                    
                    // 새 창이 닫힐 때 세션 종료를 감지하기 위한 폴링
                    if (newWindow && sessionId) {
                        const checkWindowClosed = setInterval(() => {
                            if (newWindow.closed) {
                                clearInterval(checkWindowClosed);
                                // 세션 종료 기록
                                endServiceAccess(sessionId);
                            }
                        }, 1000);
                        
                        // 5분마다 하트비트 전송 (창이 열려있는 동안)
                        const heartbeatInterval = setInterval(() => {
                            if (newWindow.closed) {
                                clearInterval(heartbeatInterval);
                            } else {
                                sendHeartbeat(sessionId);
                            }
                        }, 5 * 60 * 1000);
                    }
                } else {
                    alert('유효한 서비스 URL이 없습니다.');
                }
            } else {
                alert('이 서비스에 접근할 권한이 없습니다.');
            }
        } catch (error) {
            console.error('서비스 접근 중 오류 발생:', error);
            alert('서비스 접근 중 오류가 발생했습니다.');
        }
    };
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map(service => (
                <div 
                    key={service.id} 
                    className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300"
                >
                    <div className="p-4">
                        <div className="flex justify-between items-start mb-2">
                            <h3 
                                className="text-lg font-semibold text-gray-800 cursor-pointer"
                                onClick={() => onServiceClick(service)}
                            >
                                {service.name}
                            </h3>
                            <div className="flex items-center">
                                <button 
                                    onClick={() => onToggleFavorite(service)}
                                    className="text-yellow-500 hover:text-yellow-700 mr-2"
                                >
                                    {service.is_favorite ? <FaStar /> : <FaRegStar />}
                                </button>
                                <button
                                    onClick={() => onViewService(service)}
                                    className="text-blue-500 hover:text-blue-700 mr-2"
                                >
                                    <FaEye />
                                </button>
                                <button
                                    onClick={() => openServiceUrl(service)}
                                    className="text-green-500 hover:text-green-700"
                                    title="서비스 열기"
                                >
                                    <FaExternalLinkAlt />
                                </button>
                            </div>
                        </div>
                        
                        <div className="mb-3">
                            <TruncatedText 
                                text={service.description || "설명 없음"} 
                                maxLength={50} 
                                maxLines={2}
                                className="text-sm text-gray-600"
                            />
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <div className="flex items-center">
                                {getStatusIndicator(service.id)}
                            </div>
                            <div>
                                <select
                                    className="border rounded px-2 py-1 text-sm"
                                    value={service.group_id || ""}
                                    onChange={(e) => onAssignGroup(service.id, e.target.value === "" ? null : e.target.value)}
                                >
                                    <option value="">그룹 없음</option>
                                    {groups.map(group => (
                                        <option key={group.id} value={group.id}>
                                            {group.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const Dashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [services, setServices] = useState<Service[]>([]);
    const [servicesStatus, setServicesStatus] = useState<{[key: string]: ServiceStatus}>({});
    const [groups, setGroups] = useState<ServiceGroup[]>([]);
    
    // 서비스 모달 상태
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [showServiceModal, setShowServiceModal] = useState(false);
    
    // 그룹 모달 상태
    const [editingGroup, setEditingGroup] = useState<ServiceGroup | null>(null);
    const [showGroupModal, setShowGroupModal] = useState(false);
    
    // 서비스 상세 보기 상태
    const [viewingService, setViewingService] = useState<Service | null>(null);

    // 뷰 타입 상태
    const [isTableView, setIsTableView] = useState(() => {
        const savedView = localStorage.getItem('isTableView');
        return savedView ? JSON.parse(savedView) : true;
    });
    
    // 검색 및 필터링 상태
    const [searchTerm, setSearchTerm] = useState(() => {
        return localStorage.getItem('searchTerm') || '';
    });
    const [searchType, setSearchType] = useState<'name' | 'url'>(() => {
        return (localStorage.getItem('searchType') as 'name' | 'url') || 'name';
    });
    const [selectedGroup, setSelectedGroup] = useState<string>(() => {
        return localStorage.getItem('selectedGroup') || '';
    });
    const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>(() => {
        return (localStorage.getItem('statusFilter') as 'all' | 'online' | 'offline') || 'all';
    });
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(() => {
        const saved = localStorage.getItem('showFavoritesOnly');
        return saved ? JSON.parse(saved) : false;
    });

    // 페이지네이션 상태
    const [currentPage, setCurrentPage] = useState(() => {
        const saved = localStorage.getItem('currentPage');
        return saved ? parseInt(saved) : 1;
    });
    const itemsPerPage = 10;
    
    // 모니터링 탭 상태 추가
    const [activeTab, setActiveTab] = useState<'services' | 'monitoring'>('services');

    // 사용자 그룹 관리 상태 추가
    const [userGroups, setUserGroups] = useState<ServiceGroup[]>([]);
    const [showUserGroupModal, setShowUserGroupModal] = useState(false);
    const [editingUserGroup, setEditingUserGroup] = useState<ServiceGroup | null>(null);

    // 필터링된 서비스 목록 계산
    const filteredServices = useMemo(() => {
        let result = [...services];
        
        // 검색어 필터링
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(service => {
                if (searchType === 'name') {
                    return service.name.toLowerCase().includes(term);
                } else {
                    return service.url.toLowerCase().includes(term);
                }
            });
        }
        
        // 그룹 필터링
        if (selectedGroup) {
            result = result.filter(service => service.group_id === selectedGroup);
        }
        
        // 상태 필터링
        if (statusFilter !== 'all') {
            result = result.filter(service => {
                const status = servicesStatus[service.id];
                if (!status) return false;
                return statusFilter === 'online' ? status.running === 'online' : status.running === 'offline';
            });
        }
        
        // 즐겨찾기 필터링
        if (showFavoritesOnly) {
            result = result.filter(service => service.is_favorite);
        }
        
        return result;
    }, [services, searchTerm, searchType, selectedGroup, statusFilter, showFavoritesOnly, servicesStatus]);
    
    // 총 페이지 수 계산
    const totalPages = Math.ceil(filteredServices.length / itemsPerPage);
    
    // 현재 페이지에 표시할 서비스
    const paginatedServices = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredServices.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredServices, currentPage, itemsPerPage]);

    // 상태가 변경될 때마다 로컬 스토리지에 저장
    useEffect(() => {
        localStorage.setItem('isTableView', JSON.stringify(isTableView));
    }, [isTableView]);

    useEffect(() => {
        localStorage.setItem('searchTerm', searchTerm);
    }, [searchTerm]);

    useEffect(() => {
        localStorage.setItem('searchType', searchType);
    }, [searchType]);

    useEffect(() => {
        localStorage.setItem('selectedGroup', selectedGroup);
    }, [selectedGroup]);

    useEffect(() => {
        localStorage.setItem('statusFilter', statusFilter);
    }, [statusFilter]);

    useEffect(() => {
        localStorage.setItem('currentPage', currentPage.toString());
    }, [currentPage]);

    useEffect(() => {
        localStorage.setItem('showFavoritesOnly', JSON.stringify(showFavoritesOnly));
    }, [showFavoritesOnly]);

    // 서비스 상태가 변경될 때 즐겨찾기 상태를 로컬 스토리지에 저장
    useEffect(() => {
        if (services.length > 0) {
            // 즐겨찾기 상태만 추출하여 저장
            const favoritesMap = services.reduce((acc, service) => {
                if (service.is_favorite) {
                    acc[service.id] = true;
                }
                return acc;
            }, {} as Record<string, boolean>);
            
            localStorage.setItem('favoritesMap', JSON.stringify(favoritesMap));
            
            // 그룹 할당 상태 저장
            const groupAssignments = services.reduce((acc, service) => {
                if (service.group_id) {
                    acc[service.id] = service.group_id;
                }
                return acc;
            }, {} as Record<string, string>);
            
            localStorage.setItem('groupAssignments', JSON.stringify(groupAssignments));
        }
    }, [services]);

    // 기존 useEffect 코드 유지
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            // 현재 경로 저장 - 로그인 후 다시 이 페이지로 돌아올 수 있도록 함
            localStorage.setItem('redirectAfterLogin', window.location.pathname);
            navigate('/login');
            return;
        }
        
        const initializeDashboard = async () => {
            await checkAdminStatus();
            await fetchServices();
            await fetchServicesStatus();
            await fetchGroups();
            if (!isAdmin) {
                await fetchUserGroups(); // 일반 사용자인 경우 사용자 그룹 가져오기
            }
            setLoading(false);
        };

        initializeDashboard();

        // 상태 주기적 업데이트
        const statusInterval = setInterval(fetchServicesStatus, 30000);

        // 서비스 권한 업데이트 이벤트 리스너 추가
        const handlePermissionsUpdate = async () => {
            await checkAdminStatus();  // admin 상태 체크
            await fetchServices();     // 서비스 목록 새로고침
            await fetchServicesStatus(); // 서비스 상태 업데이트
            await fetchGroups();       // 그룹 정보 새로고침
            if (!isAdmin) {
                await fetchUserGroups(); // 사용자 그룹 정보 새로고침
            }
        };

        // 그룹 업데이트 이벤트 리스너 추가
        const handleGroupUpdate = async () => {
            await fetchServices();     // 서비스 목록 새로고침
            await fetchGroups();       // 그룹 정보 새로고침
            if (!isAdmin) {
                await fetchUserGroups(); // 사용자 그룹 정보 새로고침
            }
        };

        window.addEventListener('servicePermissionsUpdated', handlePermissionsUpdate);
        window.addEventListener('serviceGroupUpdated', handleGroupUpdate);

        // 컴포넌트 언마운트 시 이벤트 리스너 제거
        return () => {
            clearInterval(statusInterval);
            window.removeEventListener('servicePermissionsUpdated', handlePermissionsUpdate);
            window.removeEventListener('serviceGroupUpdated', handleGroupUpdate);
        };
    }, [navigate]);

    // fetchServices 함수 수정
    const fetchServices = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                return;
            }

            // 먼저 admin 상태 확인
            const admin_response = await instance.get('/verify-token', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const isAdminStatus = admin_response.data.is_admin;
            setIsAdmin(isAdminStatus);

            // admin 상태에 따른 엔드포인트 결정
            const endpoint = isAdminStatus ? '/services' : '/services/my-approved-services';
            const response = await instance.get(endpoint, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data) {
                console.log('Admin Status:', isAdminStatus);
                console.log('Services:', response.data);
                
                // 로컬 스토리지에서 즐겨찾기 상태 불러오기
                const savedFavorites = localStorage.getItem('favoritesMap');
                const favoritesMap = savedFavorites ? JSON.parse(savedFavorites) : {};
                
                // 로컬 스토리지에서 그룹 할당 상태 불러오기
                const savedGroupAssignments = localStorage.getItem('groupAssignments');
                const groupAssignments = savedGroupAssignments ? JSON.parse(savedGroupAssignments) : {};
                
                // 서비스 데이터에 로컬 스토리지의 즐겨찾기와 그룹 상태 적용
                const updatedServices = response.data.map((service: Service) => {
                    // 서버에서 받은 즐겨찾기 상태가 있으면 그대로 사용, 없으면 로컬 스토리지 값 사용
                    const isFavorite = service.is_favorite !== undefined 
                        ? service.is_favorite 
                        : !!favoritesMap[service.id];
                    
                    // 서버에서 받은 그룹 ID가 있으면 그대로 사용, 없으면 로컬 스토리지 값 사용
                    const groupId = service.group_id !== undefined 
                        ? service.group_id 
                        : groupAssignments[service.id] || null;
                    
                    return {
                        ...service,
                        is_favorite: isFavorite,
                        group_id: groupId
                    };
                });
                
                setServices(updatedServices);
                setError('');
            }
        } catch (err: any) {
            console.error('Error fetching services:', err);
            if (err.response?.status === 401) {
                localStorage.removeItem('token');
                navigate('/login');
            } else {
                setError('서비스 목록을 불러오는데 실패했습니다.');
            }
        }
    };

    // 즐겨찾기 토글 함수 수정
    const handleToggleFavorite = async (service: Service) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const newFavoriteStatus = !service.is_favorite;
            
            // 백엔드 API가 구현되어 있다고 가정
            await axios.put(`/services/${service.id}/favorite`, 
                { is_favorite: newFavoriteStatus }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            // 서비스 목록 업데이트
            const updatedServices = services.map(s => {
                if (s.id === service.id) {
                    return { ...s, is_favorite: newFavoriteStatus };
                }
                return s;
            });
            
            setServices(updatedServices);
            
            // 로컬 스토리지에 즐겨찾기 상태 저장
            const savedFavorites = localStorage.getItem('favoritesMap');
            const favoritesMap = savedFavorites ? JSON.parse(savedFavorites) : {};
            
            if (newFavoriteStatus) {
                favoritesMap[service.id] = true;
            } else {
                delete favoritesMap[service.id];
            }
            
            localStorage.setItem('favoritesMap', JSON.stringify(favoritesMap));
        } catch (err) {
            console.error('Failed to toggle favorite status:', err);
            
            // 임시 처리 (백엔드 API가 없는 경우)
            const updatedServices = services.map(s => {
                if (s.id === service.id) {
                    return { ...s, is_favorite: !s.is_favorite };
                }
                return s;
            });
            
            setServices(updatedServices);
            
            // 로컬 스토리지에 즐겨찾기 상태 저장
            const savedFavorites = localStorage.getItem('favoritesMap');
            const favoritesMap = savedFavorites ? JSON.parse(savedFavorites) : {};
            
            if (!service.is_favorite) {
                favoritesMap[service.id] = true;
            } else {
                delete favoritesMap[service.id];
            }
            
            localStorage.setItem('favoritesMap', JSON.stringify(favoritesMap));
        }
    };

    // 그룹 할당 함수 수정
    const handleAssignServiceToGroup = async (serviceId: string, groupId: string | null) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 백엔드 API가 구현되어 있다고 가정
            await axios.put(`/services/${serviceId}/group`, 
                { group_id: groupId }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            // 서비스 목록 업데이트
            const updatedServices = services.map(s => {
                if (s.id === serviceId) {
                    return { ...s, group_id: groupId };
                }
                return s;
            });
            
            setServices(updatedServices);
            
            // 로컬 스토리지에 그룹 할당 상태 저장
            const savedGroupAssignments = localStorage.getItem('groupAssignments');
            const groupAssignments = savedGroupAssignments ? JSON.parse(savedGroupAssignments) : {};
            
            if (groupId) {
                groupAssignments[serviceId] = groupId;
            } else {
                delete groupAssignments[serviceId];
            }
            
            localStorage.setItem('groupAssignments', JSON.stringify(groupAssignments));
            
            alert(groupId ? '서비스가 그룹에 추가되었습니다.' : '서비스가 그룹에서 제외되었습니다.');
        } catch (err) {
            console.error('Failed to assign service to group:', err);
            
            // 임시 처리 (백엔드 API가 없는 경우)
            const updatedServices = services.map(s => {
                if (s.id === serviceId) {
                    return { ...s, group_id: groupId };
                }
                return s;
            });
            
            setServices(updatedServices);
            
            // 로컬 스토리지에 그룹 할당 상태 저장
            const savedGroupAssignments = localStorage.getItem('groupAssignments');
            const groupAssignments = savedGroupAssignments ? JSON.parse(savedGroupAssignments) : {};
            
            if (groupId) {
                groupAssignments[serviceId] = groupId;
            } else {
                delete groupAssignments[serviceId];
            }
            
            localStorage.setItem('groupAssignments', JSON.stringify(groupAssignments));
            
            alert(groupId ? '서비스가 그룹에 추가되었습니다.' : '서비스가 그룹에서 제외되었습니다.');
        }
    };

    const checkAdminStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                return;
            }

            // 토큰 검증 요청
            const response = await instance.get('/verify-token');  // 헤더는 인터셉터가 추가

            console.log('Token verification response:', response.data);
            if (response.data.status === 'ok') {
                setIsAdmin(response.data.is_admin);
            } else {
                throw new Error('Token verification failed');
            }
        } catch (err) {
            console.error('Failed to verify admin status:', err);
            localStorage.removeItem('token');
            navigate('/login');
        }
    };

    const fetchServicesStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await instance.get('/services/status', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data) {
                setServicesStatus(response.data);
            }
        } catch (err) {
            console.error('Failed to fetch services status:', err);
        }
    };

    // 그룹 관련 함수들
    const fetchGroups = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 백엔드 API가 구현되어 있다고 가정
            const response = await instance.get('/service-groups', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data) {
                setGroups(response.data);
            }
        } catch (err) {
            console.error('Failed to fetch service groups:', err);
            // 임시 그룹 데이터 (백엔드 API가 없는 경우)
            setGroups([
                { id: 'group_1', name: '개발 서비스', description: '개발 관련 서비스 모음', created_at: new Date().toISOString() },
                { id: 'group_2', name: '운영 서비스', description: '운영 관련 서비스 모음', created_at: new Date().toISOString() },
                { id: 'group_3', name: '테스트 서비스', description: '테스트용 서비스 모음', created_at: new Date().toISOString() }
            ]);
        }
    };

    const handleSaveGroup = async (group: ServiceGroup) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 백엔드 API가 구현되어 있다고 가정
            const isNew = !groups.some(g => g.id === group.id);
            const endpoint = isNew ? '/service-groups' : `/service-groups/${group.id}`;
            const method = isNew ? 'post' : 'put';
            
            await axios({
                method,
                url: endpoint,
                data: group,
                headers: { Authorization: `Bearer ${token}` }
            });
            
            // 그룹 목록 새로고침
            await fetchGroups();
            
            // 성공 메시지
            alert(isNew ? '그룹이 생성되었습니다.' : '그룹이 수정되었습니다.');
            
            return true;
        } catch (err) {
            console.error('Failed to save group:', err);
            
            // 임시 처리 (백엔드 API가 없는 경우)
            const updatedGroups = [...groups];
            const existingIndex = updatedGroups.findIndex(g => g.id === group.id);
            
            if (existingIndex >= 0) {
                updatedGroups[existingIndex] = group;
            } else {
                updatedGroups.push(group);
            }
            
            setGroups(updatedGroups);
            alert('그룹이 저장되었습니다.');
            
            return true;
        }
    };

    const handleDeleteGroup = async (groupId: string) => {
        if (!window.confirm('이 그룹을 삭제하시겠습니까? 그룹에 속한 서비스는 그룹에서 제외됩니다.')) {
            return;
        }
        
        try {
                const token = localStorage.getItem('token');
            if (!token) return;

            // 백엔드 API가 구현되어 있다고 가정
            await axios.delete(`/service-groups/${groupId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            // 그룹 목록 새로고침
            await fetchGroups();
            
            // 그룹에 속한 서비스들의 그룹 ID 제거
            const updatedServices = services.map(service => {
                if (service.group_id === groupId) {
                    return { ...service, group_id: undefined };
                }
                return service;
            });
            
            setServices(updatedServices);
            
            // 성공 메시지
            alert('그룹이 삭제되었습니다.');
        } catch (err) {
            console.error('Failed to delete group:', err);
            
            // 임시 처리 (백엔드 API가 없는 경우)
            const updatedGroups = groups.filter(g => g.id !== groupId);
            setGroups(updatedGroups);
            
            // 그룹에 속한 서비스들의 그룹 ID 제거
            const updatedServices = services.map(service => {
                if (service.group_id === groupId) {
                    return { ...service, group_id: undefined };
                }
                return service;
            });
            
            setServices(updatedServices);
            
            alert('그룹이 삭제되었습니다.');
        }
    };

    const handleServiceClick = async (service: Service) => {
        console.log(`[대시보드] 서비스 클릭: ${service.name}, ID: ${service.id}`);
        
        try {
            // 서비스 접속 기록
            console.log(`[대시보드] 서비스 접근 기록 시작: ${service.id}`);
            const accessRecord = await recordServiceAccess(service.id);
            console.log(`[대시보드] 서비스 접근 기록 결과:`, accessRecord);
            
            const sessionId = accessRecord?.session_id;
            console.log(`[대시보드] 세션 ID: ${sessionId || '없음'}`);
            
            // 기존 로직 유지
            console.log(`[대시보드] 서비스 접근 권한 확인 시작: ${service.id}`);
            const response = await instance.get(`/services/verify-service-access?serviceId=${service.id}`);
            console.log(`[대시보드] 서비스 접근 권한 확인 결과:`, response.data);
            
            if (response.data.allowed) {
                // 항상 Nginx 라우트 사용
                const nginxUrl = `/api/${service.id}/`;
                
                // 새 창 열기
                const baseUrl = process.env.REACT_APP_NGINX_URL || '';
                const fullUrl = `${baseUrl}${nginxUrl}`;
                console.log(`[대시보드] 서비스 접근 URL: ${fullUrl}`);
                
                const newWindow = window.open(fullUrl, '_blank');
                console.log(`[대시보드] 새 창 열림: ${newWindow ? '성공' : '실패'}`);
                
                // 새 창이 닫힐 때 세션 종료를 감지하기 위한 폴링
                if (newWindow && sessionId) {
                    console.log(`[대시보드] 세션 모니터링 시작: ${sessionId}`);
                    
                    const checkWindowClosed = setInterval(() => {
                        if (newWindow.closed) {
                            clearInterval(checkWindowClosed);
                            // 세션 종료 기록
                            console.log(`[대시보드] 창 닫힘 감지, 세션 종료 기록: ${sessionId}`);
                            endServiceAccess(sessionId);
                        }
                    }, 1000);
                    
                    // 5분마다 하트비트 전송 (창이 열려있는 동안)
                    const heartbeatInterval = setInterval(() => {
                        if (newWindow.closed) {
                            console.log(`[대시보드] 창 닫힘 감지, 하트비트 중지: ${sessionId}`);
                            clearInterval(heartbeatInterval);
                        } else {
                            console.log(`[대시보드] 하트비트 전송: ${sessionId}`);
                            sendHeartbeat(sessionId);
                        }
                    }, 5 * 60 * 1000);
                }
            } else {
                console.warn(`[대시보드] 서비스 접근 권한 없음: ${service.id}`);
                alert('이 서비스에 접근할 권한이 없습니다.');
            }
        } catch (error) {
            console.error('[대시보드] 서비스 접근 중 오류 발생:', error);
            alert('서비스 접근 중 오류가 발생했습니다.');
        }
    };

    const getStatusIndicator = (serviceId: string) => {
        const status = servicesStatus[serviceId];
        if (!status) return null;

        const getStatusColor = () => {
            if (status.access === 'unavailable') return 'bg-red-500';
            return status.running === 'online' ? 'bg-green-500' : 'bg-yellow-500';
        };

        const getStatusText = () => {
            if (status.access === 'unavailable') return '접근 불가';
            return status.running === 'online' ? '정상 작동' : '서비스 중단';
        };

        return (
            <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full ${getStatusColor()} mr-2`}></div>
                <span className="text-sm text-gray-600">{getStatusText()}</span>
            </div>
        );
    };

    const handleEditService = async (updatedService: Service) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await axios.put(`/services/${updatedService.id}`, {
                name: updatedService.name,
                description: updatedService.description,
                url: updatedService.url,
                show_info: updatedService.show_info,
                protocol: updatedService.protocol,
                group_id: updatedService.group_id  // 그룹 ID 추가
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data) {
                await fetchServices();  // 서비스 목록 새로고침
                setError('');
            }
        } catch (err) {
            console.error('Failed to update service:', err);
            setError('서비스 수정 중 오류가 발생했습니다.');
        }
    };

    const deleteServices = async (serviceIds: string[]) => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            await Promise.all(
                serviceIds.map(id =>
                    axios.delete(`/services/${id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                )
            );

            // 서비스 목록 새로고침
            await fetchServices();
            
        } catch (err) {
            console.error('Failed to delete services:', err);
            setError('서비스 삭제 중 오류가 발생했습니다.');
        }
    };

    // 사용자 그룹 가져오기 함수
    const fetchUserGroups = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/user-groups', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                setUserGroups(data);
        } else {
                console.error('사용자 그룹을 가져오는데 실패했습니다.');
            }
        } catch (error) {
            console.error('사용자 그룹을 가져오는 중 오류 발생:', error);
        }
    };

    // 사용자 그룹 저장 함수
    const handleSaveUserGroup = async (group: ServiceGroup) => {
        try {
            const token = localStorage.getItem('token');
            const url = group.id ? `/api/user-groups/${group.id}` : '/api/user-groups';
            const method = group.id ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(group)
            });
            
            if (response.ok) {
                await fetchUserGroups();
                setShowUserGroupModal(false);
                setEditingUserGroup(null);
                return true;
            } else {
                console.error('사용자 그룹 저장에 실패했습니다.');
                return false;
            }
        } catch (error) {
            console.error('사용자 그룹 저장 중 오류 발생:', error);
            return false;
        }
    };

    // 사용자 그룹 삭제 함수
    const handleDeleteUserGroup = async (groupId: string) => {
        if (window.confirm('이 그룹을 삭제하시겠습니까? 그룹에 속한 서비스는 그룹에서 제외됩니다.')) {
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`/api/user-groups/${groupId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    await fetchUserGroups();
                    await fetchServices(); // 서비스 목록 갱신
                } else {
                    console.error('사용자 그룹 삭제에 실패했습니다.');
                }
            } catch (error) {
                console.error('사용자 그룹 삭제 중 오류 발생:', error);
            }
        }
    };

    // 페이지 로드 시 접속 기록 및 하트비트 설정
    useEffect(() => {
        // 페이지 접속 기록
        const initializeMonitoring = async () => {
            try {
                // 대시보드 접속 기록 제거 - 불필요한 API 호출 방지
                // 세션 관리는 유지하되 recordServiceAccess 호출 제거
                const sessionId = localStorage.getItem('current_session_id') || Math.random().toString(36).substring(2, 15);
                localStorage.setItem('current_session_id', sessionId);
                
                // 하트비트 설정 (5분마다 전송)
                const heartbeatInterval = setInterval(() => {
                    sendHeartbeat(sessionId);
                }, 5 * 60 * 1000);
                
                // 컴포넌트 언마운트 시 세션 종료 및 인터벌 정리
                return () => {
                    if (sessionId) {
                        endServiceAccess(sessionId);
                    }
                    clearInterval(heartbeatInterval);
                    localStorage.removeItem('current_session_id');
                };
            } catch (error) {
                console.error('모니터링 초기화 중 오류 발생:', error);
            }
        };
        
        initializeMonitoring();
    }, []);

    return (
        <div className="container mx-auto px-4 py-8">
            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                </div>
            ) : (
                <>
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center">
                            <h1 className="text-2xl font-bold text-gray-800 mr-4">서비스 포털</h1>
                            <button
                                onClick={async () => {
                                    try {
                                        const refreshToken = localStorage.getItem('refreshToken');
                                        if (!refreshToken) {
                                            alert('리프레시 토큰이 없습니다. 다시 로그인해주세요.');
                                            navigate('/login');
                                            return;
                                        }
                                        
                                        console.log('[DEBUG] 대시보드에서 토큰 갱신 요청 시작');
                                        
                                        // 로딩 상태 표시
                                        const button = document.getElementById('token-refresh-button') as HTMLButtonElement;
                                        if (button) {
                                            button.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> 갱신 중...';
                                            button.disabled = true;
                                        }
                                        
                                        // 다양한 방식으로 시도
                                        let response;
                                        let error;
                                        
                                        // 1. JSON 형식으로 시도
                                        try {
                                            response = await instance.post('/refresh-token', { refresh_token: refreshToken });
                                            console.log('[DEBUG] JSON 형식 토큰 갱신 성공:', response.data);
                                        } catch (jsonError) {
                                            console.log('[DEBUG] JSON 형식 요청 실패, 다른 방식 시도:', jsonError);
                                            error = jsonError;
                                            
                                            // 2. 텍스트 형식으로 시도
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
                                                
                                                // 3. URL 인코딩 형식으로 시도
                                                try {
                                                    response = await instance.post('/refresh-token', 
                                                        `refresh_token=${encodeURIComponent(refreshToken)}`, {
                                                        headers: {
                                                            'Content-Type': 'application/x-www-form-urlencoded',
                                                        }
                                                    });
                                                    console.log('[DEBUG] URL 인코딩 형식 토큰 갱신 성공:', response.data);
                                                } catch (formError) {
                                                    console.log('[DEBUG] URL 인코딩 형식 요청 실패, 다른 방식 시도:', formError);
                                                    
                                                    // 4. 쿼리 파라미터 방식 시도
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
                                        
                                        localStorage.setItem('token', accessToken);
                                        console.log('[DEBUG] 새 액세스 토큰 저장 완료:', accessToken.substring(0, 10) + '...');
                                        
                                        alert('토큰이 성공적으로 갱신되었습니다.');
                                        
                                        // 버튼 상태 복원
                                        if (button) {
                                            button.innerHTML = '<FaSync class="mr-1" /> 토큰 갱신';
                                            button.disabled = false;
                                        }
                                        
                                        // 서비스 목록 새로고침
                                        await fetchServices();
                                    } catch (error) {
                                        console.error('토큰 갱신 실패:', error);
                                        alert('토큰 갱신에 실패했습니다. 다시 로그인해주세요.');
                                        navigate('/login');
                                    }
                                }}
                                className="flex items-center bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm"
                                title="토큰 갱신"
                                id="token-refresh-button"
                            >
                                <FaSync className="mr-1" /> 토큰 갱신
                            </button>
                        </div>
                        <div className="flex items-center">
                    {isAdmin ? (
                                <>
                                    <button
                                        onClick={() => {
                                            setEditingService(null);
                                            setShowServiceModal(true);
                                        }}
                                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2"
                                    >
                                        서비스 추가
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditingGroup(null);
                                            setShowGroupModal(true);
                                        }}
                                        className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded mr-2"
                                    >
                                        그룹 추가
                                    </button>
                                </>
                            ) : (
                                // 일반 사용자용 그룹 관리 버튼 추가
                                <button
                                    onClick={() => {
                                        setEditingUserGroup(null);
                                        setShowUserGroupModal(true);
                                    }}
                                    className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded mr-2"
                                >
                                    내 그룹 추가
                                </button>
                            )}
                            <ViewToggleButton isTableView={isTableView} onToggle={() => setIsTableView(!isTableView)} />
                        </div>
                    </div>

                    {/* 필터링 및 검색 UI */}
                    <div className="mb-6 flex flex-wrap gap-4">
                        <div className="flex-1 min-w-[200px]">
                                            <input
                                                type="text"
                                placeholder="서비스 검색..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg"
                                            />
                        </div>
                        <div className="w-full md:w-auto">
                                            <select
                                value={selectedGroup}
                                onChange={(e) => setSelectedGroup(e.target.value)}
                                className="w-full md:w-auto px-4 py-2 border rounded-lg"
                            >
                                <option value="">모든 그룹</option>
                                {isAdmin ? (
                                    // 관리자용 그룹 목록
                                    groups.map(group => (
                                        <option key={group.id} value={group.id}>{group.name}</option>
                                    ))
                                ) : (
                                    // 일반 사용자용 그룹 목록 (사용자 그룹 + 관리자 그룹)
                                    <>
                                        {userGroups.map(group => (
                                            <option key={group.id} value={group.id}>{group.name} (내 그룹)</option>
                                        ))}
                                        {groups.map(group => (
                                            <option key={group.id} value={group.id}>{group.name}</option>
                                        ))}
                                    </>
                                )}
                                            </select>
                                        </div>
                        <div className="w-full md:w-auto">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'online' | 'offline')}
                                className="w-full md:w-auto px-4 py-2 border rounded-lg"
                            >
                                <option value="all">모든 상태</option>
                                <option value="">모든 상태</option>
                                <option value="online">온라인</option>
                                <option value="offline">오프라인</option>
                            </select>
                                    </div>
                        <div className="w-full md:w-auto">
                            <button
                                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                                className={`w-full md:w-auto px-4 py-2 border rounded-lg flex items-center justify-center ${
                                    showFavoritesOnly ? 'bg-yellow-100 border-yellow-300' : ''
                                }`}
                            >
                                <FaStar className={`mr-2 ${showFavoritesOnly ? 'text-yellow-500' : 'text-gray-400'}`} />
                                즐겨찾기만
                            </button>
                                </div>
                            </div>

                    {/* 사용자 그룹 관리 UI (일반 사용자용) */}
                    {!isAdmin && userGroups.length > 0 && (
                        <div className="mb-6">
                            <h2 className="text-xl font-semibold mb-3">내 그룹 관리</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {userGroups.map(group => (
                                    <div key={group.id} className="bg-white rounded-lg shadow-md p-4">
                                        <div className="flex justify-between items-start">
                                            <h3 className="font-medium text-lg">{group.name}</h3>
                                            <div className="flex">
                                                <button
                                                    onClick={() => {
                                                        setEditingUserGroup(group);
                                                        setShowUserGroupModal(true);
                                                    }}
                                                    className="text-blue-500 hover:text-blue-700 mr-2"
                                                >
                                                    <FaEdit />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUserGroup(group.id)}
                                                    className="text-red-500 hover:text-red-700"
                                                >
                                                    <FaTrash />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">
                                            {group.description || "설명 없음"}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 서비스 목록 */}
                    {isAdmin ? (
                        // 관리자용 서비스 목록
                        <>
                            {isTableView ? (
                                <AdminServiceTable 
                                    services={paginatedServices}
                                    onDelete={deleteServices}
                                    servicesStatus={servicesStatus}
                                    onServiceClick={handleServiceClick}
                                    onEditService={service => {
                                        setEditingService(service);
                                        setShowServiceModal(true);
                                    }}
                                    getStatusIndicator={getStatusIndicator}
                                    onAssignGroup={handleAssignServiceToGroup}
                                />
                            ) : (
                                <AdminServiceList
                                    services={paginatedServices}
                                    onDelete={deleteServices}
                                    servicesStatus={servicesStatus}
                                    onServiceClick={handleServiceClick}
                                    onEditService={service => {
                                        setEditingService(service);
                                        setShowServiceModal(true);
                                    }}
                                    getStatusIndicator={getStatusIndicator}
                                    onViewService={service => setViewingService(service)}
                                    onAssignGroup={handleAssignServiceToGroup}
                                />
                            )}
                        </>
                    ) : (
                        // 일반 사용자용 서비스 목록
                        <>
                            {isTableView ? (
                                <UserServiceTable
                                    services={paginatedServices}
                                    servicesStatus={servicesStatus}
                                    onServiceClick={handleServiceClick}
                                    getStatusIndicator={getStatusIndicator}
                                    onViewService={service => setViewingService(service)}
                                    onToggleFavorite={handleToggleFavorite}
                                    onAssignGroup={handleAssignServiceToGroup}
                                    groups={[...userGroups, ...groups]}
                                />
                            ) : (
                                <UserServiceList
                                    services={paginatedServices}
                                    servicesStatus={servicesStatus}
                                    onServiceClick={handleServiceClick}
                                    getStatusIndicator={getStatusIndicator}
                                    onViewService={service => setViewingService(service)}
                                    onToggleFavorite={handleToggleFavorite}
                                    onAssignGroup={handleAssignServiceToGroup}
                                    groups={[...userGroups, ...groups]}
                                />
                            )}
                        </>
                    )}

                    {/* 페이지네이션 */}
                    {filteredServices.length > 0 && (
                        <div className="mt-6 flex justify-center">
                            <nav className="flex items-center">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className={`mx-1 px-3 py-1 rounded ${
                                        currentPage === 1 
                                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    }`}
                                >
                                    이전
                                </button>
                                
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`mx-1 px-3 py-1 rounded ${
                                            currentPage === page 
                                                ? 'bg-blue-500 text-white' 
                                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                        }`}
                                    >
                                        {page}
                                    </button>
                                ))}
                                
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className={`mx-1 px-3 py-1 rounded ${
                                        currentPage === totalPages 
                                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    }`}
                                >
                                    다음
                                </button>
                            </nav>
                        </div>
                    )}

                    {filteredServices.length === 0 && (
                        <div className="text-center py-10">
                            <p className="text-gray-500 text-lg">표시할 서비스가 없습니다.</p>
                        </div>
                    )}

                    <div>
                        {/* 서비스 모달 */}
                            <EditServiceModal
                                service={editingService}
                            isOpen={showServiceModal}
                            onClose={() => {
                                setShowServiceModal(false);
                                setEditingService(null);
                            }}
                                onSave={handleEditService}
                            />
                        
                        {/* 그룹 모달 */}
                        <GroupModal
                            group={editingGroup}
                            isOpen={showGroupModal}
                            onClose={() => {
                                setShowGroupModal(false);
                                setEditingGroup(null);
                            }}
                            onSave={handleSaveGroup}
                        />
                        
                        {/* 사용자 그룹 모달 */}
                        <GroupModal
                            group={editingUserGroup}
                            isOpen={showUserGroupModal}
                            onClose={() => {
                                setShowUserGroupModal(false);
                                setEditingUserGroup(null);
                            }}
                            onSave={handleSaveUserGroup}
                        />
                        
                        {/* 서비스 상세 모달 */}
                            <ServiceDetailModal
                                service={viewingService}
                                isOpen={!!viewingService}
                                onClose={() => setViewingService(null)}
                            />
                        </div>
                </>
            )}
        </div>
    );
};

export default Dashboard; 