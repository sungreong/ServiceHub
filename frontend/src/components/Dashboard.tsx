import React, { useState, useEffect } from 'react';
import axios from '../api/axios';

interface Service {
    id: number;
    name: string;
    description: string;
    ip: string;
    port: number;
    nginx_url?: string;
    show_info: boolean;
}

interface ServiceRequest {
    id: number;
    service_id: number;
    status: string;
}

interface Timer {
    id: NodeJS.Timeout | null;
}

const Dashboard = () => {
    const [services, setServices] = useState<Service[]>([]);
    const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [viewMode, setViewMode] = useState<'tile' | 'table'>('tile');
    const [selectedServices, setSelectedServices] = useState<number[]>([]);
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
    const [refreshInterval, setRefreshInterval] = useState<Timer>({ id: null });
    const [statusCheckInterval, setStatusCheckInterval] = useState<Timer>({ id: null });
    const [searchTerm, setSearchTerm] = useState('');
    const [servicesStatus, setServicesStatus] = useState<{[key: number]: {
        access: 'available' | 'unavailable';
        running: 'online' | 'offline';
    }}>({});

    useEffect(() => {
        checkAdminStatus();
        startAutoRefresh();
        fetchServicesStatus();
        
        // 상태 체크를 위한 interval 설정
        const interval = setInterval(fetchServicesStatus, 30000);
        setStatusCheckInterval({ id: interval });
        
        return () => {
            stopAutoRefresh();
            if (statusCheckInterval.id) clearInterval(statusCheckInterval.id);
        };
    }, []);

    useEffect(() => {
        fetchServices();
        fetchServiceRequests();
    }, [isAdmin]);

    const checkAdminStatus = async () => {
        try {
            const response = await axios.get('/verify-token');
            setIsAdmin(response.data.is_admin);
        } catch (err) {
            console.error('Failed to verify admin status:', err);
        }
    };

    const fetchServices = async () => {
        try {
            setLoading(true);
            // 관리자는 모든 서비스를, 일반 사용자는 승인된 서비스만 조회
            const endpoint = isAdmin ? '/services' : '/my-approved-services';
            const response = await axios.get(endpoint);
            setServices(response.data);
        } catch (err) {
            setError('서비스 목록을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const fetchServiceRequests = async () => {
        try {
            const response = await axios.get('/my-service-requests');
            setServiceRequests(response.data);
        } catch (err) {
            console.error('Failed to fetch service requests:', err);
        }
    };

    const fetchServicesStatus = async () => {
        try {
            const response = await axios.get('/services/status');
            setServicesStatus(response.data);
        } catch (err) {
            console.error('Failed to fetch services status:', err);
        }
    };

    const handleServiceClick = (service: Service): void => {
        const url = service.nginx_url ? service.nginx_url : `/api/${service.id}/`;
        const token = localStorage.getItem('token');
        
        // 새 창을 열고 토큰을 localStorage에 저장하는 스크립트 실행
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            newWindow.document.write(`
                <html>
                <head>
                    <title>Redirecting...</title>
                    <script>
                        localStorage.setItem('token', '${token}');
                        window.location.href = '${process.env.REACT_APP_NGINX_URL}${url}';
                    </script>
                </head>
                <body>
                    <p>Redirecting to service...</p>
                </body>
                </html>
            `);
            newWindow.document.close();
        }
    };

    const handleRemoveService = async (serviceId: number, event?: React.MouseEvent) => {
        event?.stopPropagation();

        if (!window.confirm('이 서비스에 대한 접근 해제를 요청하시겠습니까?\n관리자 승인 후 접근이 해제됩니다.')) {
            return;
        }

        try {
            await axios.post(`/my-services/${serviceId}/remove-request`);
            setMessage({
                type: 'success',
                text: '서비스 접근 해제 요청이 등록되었습니다. 관리자 승인을 기다려주세요.'
            });
            await refreshData();
        } catch (err: any) {
            const errorMessage = err.response?.data?.detail || '서비스 접근 해제 요청에 실패했습니다.';
            setError(errorMessage);
        }
    };

    const handleViewModeChange = () => {
        setViewMode(prev => prev === 'tile' ? 'table' : 'tile');
    };

    const handleSelectService = (serviceId: number) => {
        setSelectedServices(prev => {
            if (prev.includes(serviceId)) {
                return prev.filter(id => id !== serviceId);
            }
            return [...prev, serviceId];
        });
    };

    const handleSelectAll = () => {
        if (selectedServices.length === services.length) {
            setSelectedServices([]);
        } else {
            setSelectedServices(services.map(service => service.id));
        }
    };

    const handleDeleteSelected = async () => {
        if (!window.confirm(`선택한 ${selectedServices.length}개의 서비스를 삭제하시겠습니까?`)) {
            return;
        }

        try {
            await Promise.all(selectedServices.map(id => 
                axios.delete(`/services/${id}`)
            ));
            setSelectedServices([]);
            refreshData();
        } catch (err) {
            setDeleteError('일부 서비스 삭제에 실패했습니다.');
        }
    };

    // 서비스의 상태를 확인하는 함수
    const getServiceStatus = (serviceId: number) => {
        const request = serviceRequests.find(
            req => req.service_id === serviceId && req.status === 'remove_pending'
        );
        return request ? 'remove_pending' : 'active';
    };

    // 서비스 상태에 따른 스타일 클래스를 반환하는 함수
    const getServiceStatusStyle = (status: string) => {
        switch (status) {
            case 'remove_pending':
                return 'bg-yellow-50 border-yellow-300';
            default:
                return 'bg-white border-gray-200';
        }
    };

    // 서비스 상태 텍스트를 반환하는 함수
    const getServiceStatusText = (status: string) => {
        switch (status) {
            case 'remove_pending':
                return '(접근 해제 요청 중)';
            default:
                return '';
        }
    };

    // 주기적 새로고침 시작 (15초로 간격 증가)
    const startAutoRefresh = () => {
        if (refreshInterval.id) return;
        
        const interval = setInterval(async () => {
            try {
                await refreshData();
            } catch (err) {
                console.error('Failed to refresh data:', err);
            }
        }, 15000);
        
        setRefreshInterval({ id: interval });
    };

    // 주기적 새로고침 중지
    const stopAutoRefresh = () => {
        if (refreshInterval.id) {
            clearInterval(refreshInterval.id);
            setRefreshInterval({ id: null });
        }
    };

    // 즉시 새로고침 (수동 새로고침 버튼용)
    const refreshData = async () => {
        try {
            setLoading(true);
            const endpoint = isAdmin ? '/services' : '/my-approved-services';
            const servicesResponse = await axios.get(endpoint);
            setServices(servicesResponse.data);

            const requestsResponse = await axios.get('/my-service-requests');
            setServiceRequests(requestsResponse.data);
        } catch (err) {
            setError('데이터를 새로고침하는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 검색어에 따른 필터링된 서비스 목록
    const filteredServices = services.filter(service => 
        service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.ip.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.port.toString().includes(searchTerm)
    );

    const getStatusIndicator = (serviceId: number) => {
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

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4">
            <h2 className="text-2xl font-bold mb-6">서비스 목록</h2>

            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-600 rounded">
                    {error}
                </div>
            )}

            {/* 검색 입력 필드 */}
            <div className="mb-4">
                <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        placeholder="서비스 검색 (이름, 설명, IP, PORT)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="p-2 border rounded w-full md:w-1/3"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="p-2 text-gray-500 hover:text-gray-700"
                        >
                            ✕
                        </button>
                    )}
                </div>
                {searchTerm && (
                    <p className="mt-2 text-sm text-gray-600">
                        검색 결과: {filteredServices.length}개의 서비스
                    </p>
                )}
            </div>

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">
                    {isAdmin ? '전체 서비스 목록' : '내가 접근 가능한 서비스 목록'}
                </h2>
                <div className="flex gap-4">
                    <button
                        onClick={refreshData}
                        className="px-4 py-2 bg-blue-100 rounded hover:bg-blue-200"
                    >
                        새로고침
                    </button>
                    <button
                        onClick={handleViewModeChange}
                        className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
                    >
                        {viewMode === 'tile' ? '테이블 보기' : '타일 보기'}
                    </button>
                    {selectedServices.length > 0 && (
                        <button
                            onClick={handleDeleteSelected}
                            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                            선택 삭제 ({selectedServices.length})
                        </button>
                    )}
                </div>
            </div>

            {viewMode === 'tile' ? (
                // Tile View
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredServices.map((service) => {
                        const status = getServiceStatus(service.id);
                        return (
                            <div
                                key={service.id}
                                className={`rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow relative border ${getServiceStatusStyle(status)}`}
                            >
                                {/* 상단 컨트롤 영역 */}
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedServices.includes(service.id)}
                                            onChange={() => handleSelectService(service.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="h-4 w-4"
                                        />
                                        {getStatusIndicator(service.id)}
                                    </div>
                                    <button
                                        onClick={(e) => handleRemoveService(service.id, e)}
                                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>

                                {/* 서비스 정보 영역 */}
                                <div onClick={() => handleServiceClick(service)}>
                                    <h3 className="text-lg font-semibold mb-2">
                                        {service.name}
                                        {status === 'remove_pending' && (
                                            <span className="ml-2 text-sm text-yellow-600">
                                                {getServiceStatusText(status)}
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-gray-600 mb-4">{service.description}</p>
                                    <div className="text-sm text-gray-500">
                                        {(isAdmin || service.show_info) ? (
                                            `${service.ip}:${service.port}`
                                        ) : (
                                            '정보 비공개'
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                // Table View
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white rounded-lg shadow">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-4">
                                    <input
                                        type="checkbox"
                                        checked={selectedServices.length === filteredServices.length}
                                        onChange={handleSelectAll}
                                        className="h-4 w-4"
                                    />
                                </th>
                                <th className="p-4 text-left">이름</th>
                                <th className="p-4 text-left">설명</th>
                                <th className="p-4 text-left">IP:Port</th>
                                <th className="p-4 text-left">상태</th>
                                <th className="p-4 text-center">작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredServices.map((service) => {
                                const status = getServiceStatus(service.id);
                                return (
                                    <tr 
                                        key={service.id} 
                                        className={`border-t hover:bg-gray-50 ${getServiceStatusStyle(status)}`}
                                    >
                                        <td className="p-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedServices.includes(service.id)}
                                                onChange={() => handleSelectService(service.id)}
                                                className="h-4 w-4"
                                            />
                                        </td>
                                        <td className="p-4" onClick={() => handleServiceClick(service)}>
                                            {service.name}
                                            {status === 'remove_pending' && (
                                                <span className="ml-2 text-sm text-yellow-600">
                                                    {getServiceStatusText(status)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4" onClick={() => handleServiceClick(service)}>
                                            {service.description}
                                        </td>
                                        <td className="p-4" onClick={() => handleServiceClick(service)}>
                                            {(isAdmin || service.show_info) ? (
                                                `${service.ip}:${service.port}`
                                            ) : (
                                                '정보 비공개'
                                            )}
                                        </td>
                                        <td className="p-4">
                                            {getStatusIndicator(service.id)}
                                        </td>
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={(e) => handleRemoveService(service.id, e)}
                                                className="text-red-600 hover:text-red-800"
                                            >
                                                접근 해제 요청
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {filteredServices.length === 0 && !error && (
                <div className="text-center text-gray-500 py-8">
                    {searchTerm ? '검색 결과가 없습니다.' : '등록된 서비스가 없습니다.'}
                </div>
            )}

            {selectedServices.length > 0 && (
                <div className="mt-4 p-4 bg-gray-100 rounded flex justify-between items-center">
                    <span className="text-gray-700">
                        {selectedServices.length}개의 서비스 선택됨
                    </span>
                    <div className="space-x-2">
                        <button
                            onClick={() => setSelectedServices([])}
                            className="text-red-600 hover:text-red-800"
                        >
                            선택 해제
                        </button>
                        {/* 선택된 서비스에 대한 추가 작업 버튼들 */}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard; 