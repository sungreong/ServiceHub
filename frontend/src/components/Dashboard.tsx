import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import { useNavigate } from 'react-router-dom';

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
}

interface ServiceStatus {
    access: 'available' | 'unavailable';
    running: 'online' | 'offline';
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

    useEffect(() => {
        if (service) {
            setFormData({ ...service });
            setIsDescriptionExpanded(false);
        }
    }, [service]);

    if (!isOpen || !formData) return null;

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
                                value={formData.description}
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
                                {formData.description.length}/500자
                            </span>
                            {formData.description.length > 100 && (
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
    const shouldTruncate = text.length > maxLength;

    if (!shouldTruncate) {
        return <span className={className}>{text}</span>;
    }

    return (
        <div className={`relative ${className}`}>
            <div
                className={`${
                    isExpanded ? '' : `line-clamp-${maxLines}`
                } break-words whitespace-pre-wrap`}
            >
                {text}
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();  // 이벤트 버블링 방지
                    setIsExpanded(!isExpanded);
                }}
                className="text-blue-500 hover:text-blue-700 text-sm mt-1"
            >
                {isExpanded ? '접기' : '더보기'}
            </button>
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
    if (!isOpen || !service) return null;

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
                    <div>
                        <h3 className="text-lg font-semibold mb-2">URL</h3>
                        <p className="text-gray-700">{service.url}</p>
                    </div>
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
    onViewService
}: { 
    services: Service[], 
    onDelete: (ids: string[]) => void,
    servicesStatus: {[key: string]: ServiceStatus},
    onServiceClick: (service: Service) => void,
    onEditService: (service: Service) => void,
    getStatusIndicator: (serviceId: string) => React.ReactNode,
    onViewService: (service: Service) => void
}) => {
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
    getStatusIndicator
}: { 
    services: Service[], 
    onDelete: (ids: string[]) => void,
    servicesStatus: {[key: string]: ServiceStatus},
    onServiceClick: (service: Service) => void,
    onEditService: (service: Service) => void,
    getStatusIndicator: (serviceId: string) => React.ReactNode
}) => {
    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [selectAll, setSelectAll] = useState(false);
    const [viewingService, setViewingService] = useState<Service | null>(null);

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

const Dashboard = () => {
    const navigate = useNavigate();
    const [services, setServices] = useState<Service[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [servicesStatus, setServicesStatus] = useState<{[key: string]: ServiceStatus}>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [searchType, setSearchType] = useState<'name' | 'url'>('name');
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [isTableView, setIsTableView] = useState(true);
    const [viewingService, setViewingService] = useState<Service | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login');
            return;
        }
        
        const initializeDashboard = async () => {
            await checkAdminStatus();
            await fetchServices();
            await fetchServicesStatus();
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
        };

        window.addEventListener('servicePermissionsUpdated', handlePermissionsUpdate);

        // 컴포넌트 언마운트 시 이벤트 리스너 제거
        return () => {
            clearInterval(statusInterval);
            window.removeEventListener('servicePermissionsUpdated', handlePermissionsUpdate);
        };
    }, [navigate]);

    const checkAdminStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                return;
            }

            // 토큰 검증 요청
            const response = await axios.get('/verify-token');  // 헤더는 인터셉터가 추가

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

    const fetchServices = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/login');
                return;
            }

            // 먼저 admin 상태 확인
            const admin_response = await axios.get('/verify-token', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const isAdminStatus = admin_response.data.is_admin;
            setIsAdmin(isAdminStatus);

            // admin 상태에 따른 엔드포인트 결정
            const endpoint = isAdminStatus ? '/services' : '/services/my-approved-services';
            const response = await axios.get(endpoint, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data) {
                console.log('Admin Status:', isAdminStatus);
                console.log('Services:', response.data);
                setServices(response.data);
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

    const fetchServicesStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await axios.get('/services/status', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data) {
                setServicesStatus(response.data);
            }
        } catch (err) {
            console.error('Failed to fetch services status:', err);
        }
    };

    const handleServiceClick = async (service: Service) => {
        const status = servicesStatus[service.id];
        if (!status || status.access === 'unavailable') {
            alert('이 서비스에 대한 접근 권한이 없습니다.');
            return;
        }

        const url = service.nginx_url ? service.nginx_url : `/api/${service.id}/`;
        
        try {
            // 서비스 접근 전 권한 재확인
            const authResponse = await axios.get('/services/verify-service-access', {
                params: { serviceId: service.id }
            });

            if (authResponse.data.allowed) {
                const userId = authResponse.data.userId;  // 백엔드에서 사용자 ID 받기
                const targetUrl = `${process.env.REACT_APP_NGINX_URL}${url}`;

                // 새 창 열기
                const newWindow = window.open('', '_blank');
                if (newWindow) {
                    newWindow.document.write(`
                        <html>
                            <head>
                                <title>서비스로 이동 중...</title>
                                <script>
                                    // 사용자 ID를 쿠키에 저장 (SameSite=Lax 설정 추가)
                                    document.cookie = 'user_id=${userId}; path=/; SameSite=Lax';
                                    
                                    // 쿠키가 제대로 설정되었는지 확인
                                    console.log('Cookie set:', document.cookie);
                                    
                                    // 타겟 URL로 이동
                                    window.location.href = '${targetUrl}';
                                </script>
                            </head>
                            <body>
                                <p>서비스로 이동 중입니다...</p>
                            </body>
                        </html>
                    `);
                    newWindow.document.close();
                } else {
                    alert('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.');
                }
            } else {
                alert('서비스 접근 권한이 없습니다.');
            }
        } catch (error) {
            console.error('Service access verification failed:', error);
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
                protocol: updatedService.protocol
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

    const filteredServices = services.filter(service => {
        const searchLower = searchTerm.toLowerCase();
        if (searchType === 'name') {
            return service.name.toLowerCase().includes(searchLower);
        } else {
            return service.url.toLowerCase().includes(searchLower);
        }
    });

    return (
        <div className="container mx-auto px-4 py-6">
            {error && (
                <div className="mb-6 p-4 bg-red-100 text-red-600 rounded-lg">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            ) : (
                <>
                    {isAdmin ? (
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <h2 className="text-2xl font-bold text-gray-800">서비스 관리</h2>
                                <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                                    <div className="flex-grow sm:max-w-md">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder={searchType === 'name' ? "서비스 이름으로 검색..." : "URL로 검색..."}
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full p-3 pr-24 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                            <select
                                                value={searchType}
                                                onChange={(e) => setSearchType(e.target.value as 'name' | 'url')}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="name">이름</option>
                                                <option value="url">URL</option>
                                            </select>
                                        </div>
                                    </div>
                                    <ViewToggleButton 
                                        isTableView={isTableView} 
                                        onToggle={() => setIsTableView(!isTableView)} 
                                    />
                                </div>
                            </div>
                            {isTableView ? (
                                <AdminServiceTable 
                                    services={filteredServices} 
                                    onDelete={deleteServices}
                                    servicesStatus={servicesStatus}
                                    onServiceClick={handleServiceClick}
                                    onEditService={setEditingService}
                                    getStatusIndicator={getStatusIndicator}
                                />
                            ) : (
                                <AdminServiceList
                                    services={filteredServices}
                                    onDelete={deleteServices}
                                    servicesStatus={servicesStatus}
                                    onServiceClick={handleServiceClick}
                                    onEditService={setEditingService}
                                    getStatusIndicator={getStatusIndicator}
                                    onViewService={(service) => setViewingService(service)}
                                />
                            )}
                            <EditServiceModal
                                service={editingService}
                                isOpen={!!editingService}
                                onClose={() => setEditingService(null)}
                                onSave={handleEditService}
                            />
                            <ServiceDetailModal
                                service={viewingService}
                                isOpen={!!viewingService}
                                onClose={() => setViewingService(null)}
                            />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <h2 className="text-2xl font-bold text-gray-800">
                                    내가 접근 가능한 서비스 목록
                                </h2>
                                <div className="flex-grow sm:max-w-md">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder={searchType === 'name' ? "서비스 이름으로 검색..." : "URL로 검색..."}
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full p-3 pr-24 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <select
                                            value={searchType}
                                            onChange={(e) => setSearchType(e.target.value as 'name' | 'url')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-white border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="name">이름</option>
                                            <option value="url">URL</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                                {filteredServices.length > 0 ? (
                                    filteredServices.map((service) => (
                                        <div
                                            key={service.id}
                                            onClick={() => handleServiceClick(service)}
                                            className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 cursor-pointer overflow-hidden"
                                        >
                                            <div className="p-4 md:p-6">
                                                <div className="flex justify-between items-start mb-3">
                                                    <h3 className="text-lg font-semibold flex-grow pr-2">
                                                        <TruncatedText text={service.name} maxLength={30} maxLines={1} />
                                                    </h3>
                                                    {getStatusIndicator(service.id)}
                                                </div>
                                                <div className="mb-4 min-h-[4.5rem]">
                                                    <TruncatedText text={service.description} maxLength={200} maxLines={3} />
                                                </div>
                                                {(isAdmin || service.show_info) && (
                                                    <div className="text-sm text-gray-500">
                                                        <TruncatedText text={service.url} maxLength={100} maxLines={2} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="col-span-full text-center py-12 text-gray-500">
                                        서비스가 없습니다.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Dashboard; 