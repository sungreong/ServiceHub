import React, { useState, useEffect } from 'react';
import instance from '../api/axios';

interface Service {
    id: number;
    name: string;
    description: string;
    ip: string;
    port: number;
    status: {
        isActive: boolean;
        lastChecked: string;
        responseTime?: number;
        error?: string;
        details?: string;
        retryCount?: number;
    };
}

interface User {
    email: string;
}

interface ServiceRequest {
    id: number;
    service_id: number;
    status: string;
    request_date: string;
    response_date: string | null;
    service: Service;
    user: User;
    rejection_reason?: string;
}

const ServiceRequests: React.FC = () => {
    const [myRequests, setMyRequests] = useState<ServiceRequest[]>([]);
    const [availableServices, setAvailableServices] = useState<Service[]>([]);
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
    const [serviceStatuses, setServiceStatuses] = useState<{[key: number]: Service['status']}>({});

    useEffect(() => {
        checkAdminStatus();
        fetchMyRequests();
        fetchAvailableServices();
    }, []);

    useEffect(() => {
        const ws = new WebSocket(process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws');
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'permission_update') {
                fetchMyRequests();
                if (isAdmin) {
                    fetchAllRequests();
                }
            }
        };

        return () => {
            ws.close();
        };
    }, [isAdmin]);

    const checkAdminStatus = async () => {
        try {
            console.log('checkAdminStatus 호출됨');
            const response = await instance.get('/verify-token');
            console.log('checkAdminStatus 응답:', response.data);
            setIsAdmin(response.data.is_admin);
            if (response.data.is_admin) {
                fetchAllRequests();
            }
        } catch (err) {
            console.error('Failed to verify admin status:', err);
        }
    };

    const fetchMyRequests = async () => {
        try {
            const response = await instance.get('/services/my-service-requests');
            setMyRequests(response.data);
        } catch (err) {
            setError('요청 목록을 불러오는데 실패했습니다.');
        }
    };

    const fetchAvailableServices = async () => {
        try {
            const response = await instance.get('/services/available-services');
            setAvailableServices(response.data);
        } catch (err) {
            setError('사용 가능한 서비스 목록을 불러오는데 실패했습니다.');
        }
    };

    const fetchAllRequests = async () => {
        try {
            const response = await instance.get('/services/service-requests');
            setAllRequests(response.data);
        } catch (err) {
            setError('전체 요청 목록을 불러오는데 실패했습니다.');
        }
    };

    const fetchServiceStatus = async (serviceId: number) => {
        try {
            const response = await instance.get(`/services/${serviceId}/status`);
            setServiceStatuses(prev => ({
                ...prev,
                [serviceId]: response.data
            }));
        } catch (err) {
            console.error(`서비스 상태 조회 실패 (ID: ${serviceId}):`, err);
        }
    };

    useEffect(() => {
        const updateAllServiceStatuses = () => {
            availableServices.forEach(service => {
                fetchServiceStatus(service.id);
            });
        };

        updateAllServiceStatuses();
        const interval = setInterval(updateAllServiceStatuses, 30000);

        return () => clearInterval(interval);
    }, [availableServices]);

    const handleServiceRequest = async (serviceId: number) => {
        try {
            await instance.post(`/services/service-requests/${serviceId}`);
            setMessage({
                type: 'success',
                text: '서비스 접근 요청이 성공적으로 생성되었습니다.'
            });
            fetchAvailableServices();
            fetchMyRequests();
        } catch (err: any) {
            setError(err.response?.data?.detail || '서비스 요청 생성에 실패했습니다.');
        }
    };

    const handleCancelRequest = async (requestId: number) => {
        try {
            await instance.delete(`/services/service-requests/${requestId}`);
            setMessage({
                type: 'success',
                text: '서비스 요청이 취소되었습니다.'
            });
            fetchMyRequests();
            fetchAvailableServices();
        } catch (err) {
            setError('요청 취소에 실패했습니다.');
        }
    };

    const handleApproveRequest = async (requestId: number) => {
        try {
            await instance.put(`/services/service-requests/${requestId}/approve`);
            setMessage({
                type: 'success',
                text: '요청이 승인되었습니다.'
            });
            fetchAllRequests();
        } catch (err) {
            setError('요청 승인에 실패했습니다.');
        }
    };

    const handleRejectRequest = async (requestId: number) => {
        try {
            await instance.put(`/services/service-requests/${requestId}/reject`);
            setMessage({
                type: 'success',
                text: '요청이 거절되었습니다.'
            });
            fetchAllRequests();
        } catch (err) {
            setError('요청 거절에 실패했습니다.');
        }
    };

    const getStatusChangeMessage = (status: string) => {
        switch (status) {
            case 'approved':
                return '승인됨';
            case 'rejected':
                return '거절됨 (권한 해제됨)';
            case 'pending':
                return '대기중';
            default:
                return status;
        }
    };

    const ServiceStatusBadge: React.FC<{ status: Service['status'] }> = ({ status }) => {
        if (!status) return null;

        return (
            <div className="flex flex-col space-y-1">
                <div className="flex items-center space-x-2">
                    <span className={`w-2 h-2 rounded-full ${
                        status.isActive ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span className="text-sm">
                        {status.isActive ? (
                            <span className="text-green-600">
                                정상 ({status.responseTime}ms)
                            </span>
                        ) : (
                            <span className="text-red-600">
                                {status.error || '응답 없음'}
                            </span>
                        )}
                    </span>
                </div>
                {status.details && (
                    <span className="text-xs text-gray-500">
                        {status.details}
                    </span>
                )}
                <span className="text-xs text-gray-500">
                    마지막 확인: {new Date(status.lastChecked).toLocaleTimeString()}
                    {status.retryCount !== undefined && status.retryCount > 0 && 
                        ` (재시도: ${status.retryCount}회)`
                    }
                </span>
            </div>
        );
    };

    return (
        <div className="container mx-auto p-4">
            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-600 rounded">
                    {error}
                </div>
            )}
            {message && (
                <div className={`mb-4 p-3 rounded ${
                    message.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                }`}>
                    {message.text}
                </div>
            )}

            {/* 요청 가능한 서비스 목록 */}
            <div className="mb-8">
                <h2 className="text-2xl font-bold mb-4">요청 가능한 서비스</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {availableServices.map((service) => (
                        <div key={service.id} className="bg-white p-4 rounded shadow">
                            <h3 className="font-semibold mb-2">{service.name}</h3>
                            <p className="text-gray-600 text-sm mb-2">{service.description}</p>
                            <div className="mb-3">
                                <ServiceStatusBadge status={serviceStatuses[service.id]} />
                            </div>
                            <button
                                onClick={() => handleServiceRequest(service.id)}
                                className={`bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 ${
                                    serviceStatuses[service.id]?.isActive === false ? 'opacity-75' : ''
                                }`}
                            >
                                접근 요청
                                {serviceStatuses[service.id]?.isActive === false && ' (서비스 상태 확인 필요)'}
                            </button>
                        </div>
                    ))}
                </div>
                {availableServices.length === 0 && (
                    <p className="text-gray-500">요청 가능한 서비스가 없습니다.</p>
                )}
            </div>

            {/* 내 요청 목록 */}
            <div className="mb-8">
                <h2 className="text-2xl font-bold mb-4">내 요청 목록</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="p-4 text-left">서비스</th>
                                <th className="p-4 text-left">상태</th>
                                <th className="p-4 text-left">요청일</th>
                                <th className="p-4 text-left">응답일</th>
                                <th className="p-4 text-left">작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {myRequests.map((request) => (
                                <tr key={request.id} className="border-t">
                                    <td className="p-4">{request.service.name}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-sm ${
                                            request.status === 'approved' ? 'bg-green-100 text-green-800' :
                                            request.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                            'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {getStatusChangeMessage(request.status)}
                                        </span>
                                        {request.status === 'rejected' && request.rejection_reason === 'permission_revoked' && (
                                            <span className="ml-2 text-xs text-gray-500">
                                                (권한이 해제되었습니다)
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4">{new Date(request.request_date).toLocaleDateString()}</td>
                                    <td className="p-4">
                                        {request.response_date ? 
                                            new Date(request.response_date).toLocaleDateString() : 
                                            '-'
                                        }
                                    </td>
                                    <td className="p-4">
                                        {request.status === 'pending' && (
                                            <button
                                                onClick={() => handleCancelRequest(request.id)}
                                                className="text-red-600 hover:text-red-800"
                                            >
                                                취소
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {myRequests.length === 0 && (
                        <p className="text-gray-500 p-4">요청 내역이 없습니다.</p>
                    )}
                </div>
            </div>

            {/* 관리자용 전체 요청 목록 */}
            {isAdmin && (
                <div>
                    <h2 className="text-2xl font-bold mb-4">전체 요청 목록</h2>
                    <div className="overflow-x-auto">
                        <table className="min-w-full bg-white">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th className="p-4 text-left">사용자</th>
                                    <th className="p-4 text-left">서비스</th>
                                    <th className="p-4 text-left">상태</th>
                                    <th className="p-4 text-left">요청일</th>
                                    <th className="p-4 text-left">작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allRequests.map((request) => (
                                    <tr key={request.id} className="border-t">
                                        <td className="p-4">{request.user?.email}</td>
                                        <td className="p-4">{request.service.name}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-sm ${
                                                request.status === 'approved' ? 'bg-green-100 text-green-800' :
                                                request.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                'bg-yellow-100 text-yellow-800'
                                            }`}>
                                                {getStatusChangeMessage(request.status)}
                                            </span>
                                        </td>
                                        <td className="p-4">{new Date(request.request_date).toLocaleDateString()}</td>
                                        <td className="p-4">
                                            {request.status === 'pending' && (
                                                <div className="space-x-2">
                                                    <button
                                                        onClick={() => handleApproveRequest(request.id)}
                                                        className="text-green-600 hover:text-green-800"
                                                    >
                                                        승인
                                                    </button>
                                                    <button
                                                        onClick={() => handleRejectRequest(request.id)}
                                                        className="text-red-600 hover:text-red-800"
                                                    >
                                                        거절
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {allRequests.length === 0 && (
                            <p className="text-gray-500 p-4">요청 내역이 없습니다.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ServiceRequests; 