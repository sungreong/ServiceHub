import React, { useState, useEffect } from 'react';
import axios from '../api/axios';

interface Service {
    id: number;
    name: string;
}

interface User {
    id: number;
    email: string;
}

interface ServiceRequest {
    id: number;
    service: Service;
    user: User;
    status: string;
    request_date: string;
}

const PendingRequests: React.FC = () => {
    const [pendingRequests, setPendingRequests] = useState<ServiceRequest[]>([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
    const [selectedRequests, setSelectedRequests] = useState<number[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [filters, setFilters] = useState({
        userId: '',
        serviceId: '',
    });
    const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timer | null>(null);

    useEffect(() => {
        fetchPendingRequests();
        fetchUsers();
        fetchServices();
        startAutoRefresh();
        return () => stopAutoRefresh();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/users');
            setUsers(response.data);
        } catch (err) {
            console.error('Failed to fetch users:', err);
        }
    };

    const fetchServices = async () => {
        try {
            const response = await axios.get('/services');
            setServices(response.data);
        } catch (err) {
            console.error('Failed to fetch services:', err);
        }
    };

    const fetchPendingRequests = async () => {
        try {
            const response = await axios.get('/service-requests');
            setPendingRequests(response.data.filter((req: ServiceRequest) => 
                req.status === 'pending' || req.status === 'remove_pending'
            ));
        } catch (err) {
            setError('요청 목록을 불러오는데 실패했습니다.');
        }
    };

    // 주기적 새로고침 시작
    const startAutoRefresh = () => {
        if (refreshInterval) return;
        const interval = setInterval(() => {
            fetchPendingRequests();
            fetchUsers();
            fetchServices();
        }, 5000); // 5초마다 새로고침
        setRefreshInterval(interval);
    };

    // 주기적 새로고침 중지
    const stopAutoRefresh = () => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            setRefreshInterval(null);
        }
    };

    // 즉시 새로고침
    const refreshData = () => {
        fetchPendingRequests();
        fetchUsers();
        fetchServices();
    };

    const handleRequestUpdate = async (requestId: number, status: string) => {
        try {
            await axios.put(`/service-requests/${requestId}`, { status });
            setMessage({
                type: 'success',
                text: `요청이 ${status === 'approved' ? '승인' : '거절'}되었습니다.`
            });
            refreshData(); // 즉시 새로고침
        } catch (err: any) {
            const errorMessage = err.response?.data?.detail || 
                               (typeof err.response?.data === 'object' ? 
                                '요청 처리에 실패했습니다.' : 
                                err.response?.data);
            setError(errorMessage);
        }
    };

    const handleBulkUpdate = async (status: string) => {
        try {
            await Promise.all(
                selectedRequests.map(requestId =>
                    axios.put(`/service-requests/${requestId}`, { status })
                )
            );
            setMessage({
                type: 'success',
                text: `선택한 요청이 ${status === 'approved' ? '승인' : '거절'}되었습니다.`
            });
            fetchPendingRequests();
            setSelectedRequests([]); // 선택 초기화
        } catch (err: any) {
            setError(err.response?.data?.detail || '요청 처리에 실패했습니다.');
        }
    };

    const handleSelectAll = () => {
        if (selectedRequests.length === filteredRequests.length) {
            setSelectedRequests([]);
        } else {
            setSelectedRequests(filteredRequests.map(req => req.id));
        }
    };

    const handleSelectRequest = (requestId: number) => {
        setSelectedRequests(prev => {
            if (prev.includes(requestId)) {
                return prev.filter(id => id !== requestId);
            }
            return [...prev, requestId];
        });
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // 필터링된 요청 목록
    const filteredRequests = pendingRequests.filter(request => {
        if (filters.userId && request.user.id.toString() !== filters.userId) {
            return false;
        }
        if (filters.serviceId && request.service.id.toString() !== filters.serviceId) {
            return false;
        }
        return true;
    });

    const getStatusText = (status: string) => {
        switch (status) {
            case 'pending':
                return '승인 대기';
            case 'remove_pending':
                return '해제 대기';
            case 'approved':
                return '승인됨';
            case 'rejected':
                return '거절됨';
            default:
                return status;
        }
    };

    const getRequestTypeText = (status: string) => {
        return status === 'remove_pending' ? '접근 해제 요청' : '접근 요청';
    };

    return (
        <div className="container mx-auto p-4">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">승인 대기 중인 요청</h2>
                <button
                    onClick={refreshData}
                    className="px-4 py-2 bg-blue-100 rounded hover:bg-blue-200"
                >
                    새로고침
                </button>
            </div>
            
            {error && typeof error === 'string' && (
                <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
                    {error}
                </div>
            )}
            {message && (
                <div className={`p-3 rounded mb-4 ${
                    message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                    {message.text}
                </div>
            )}

            {/* 필터 섹션 */}
            <div className="mb-6 flex gap-4">
                <select
                    name="userId"
                    value={filters.userId}
                    onChange={handleFilterChange}
                    className="p-2 border rounded"
                >
                    <option value="">모든 사용자</option>
                    {users.map(user => (
                        <option key={user.id} value={user.id}>
                            {user.email}
                        </option>
                    ))}
                </select>

                <select
                    name="serviceId"
                    value={filters.serviceId}
                    onChange={handleFilterChange}
                    className="p-2 border rounded"
                >
                    <option value="">모든 서비스</option>
                    {services.map(service => (
                        <option key={service.id} value={service.id}>
                            {service.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* 일괄 처리 버튼 */}
            {selectedRequests.length > 0 && (
                <div className="mb-4 flex gap-2">
                    <button
                        onClick={() => handleBulkUpdate('approved')}
                        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                    >
                        선택 승인 ({selectedRequests.length})
                    </button>
                    <button
                        onClick={() => handleBulkUpdate('rejected')}
                        className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                    >
                        선택 거절 ({selectedRequests.length})
                    </button>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                    <thead>
                        <tr>
                            <th className="px-4 py-2">요청 유형</th>
                            <th className="px-4 py-2">사용자</th>
                            <th className="px-4 py-2">서비스</th>
                            <th className="px-4 py-2">요청일</th>
                            <th className="px-4 py-2">상태</th>
                            <th className="px-4 py-2">작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRequests.map((request) => (
                            <tr key={request.id} className="hover:bg-gray-50">
                                <td className="border px-4 py-2">
                                    {getRequestTypeText(request.status)}
                                </td>
                                <td className="border px-4 py-2">{request.user.email}</td>
                                <td className="border px-4 py-2">{request.service.name}</td>
                                <td className="border px-4 py-2">
                                    {new Date(request.request_date).toLocaleString()}
                                </td>
                                <td className="border px-4 py-2">
                                    {getStatusText(request.status)}
                                </td>
                                <td className="border px-4 py-2">
                                    {(request.status === 'pending' || request.status === 'remove_pending') && (
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => handleRequestUpdate(request.id, 'approved')}
                                                className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                                            >
                                                승인
                                            </button>
                                            <button
                                                onClick={() => handleRequestUpdate(request.id, 'rejected')}
                                                className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
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
            </div>
            
            {filteredRequests.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                    승인 대기 중인 요청이 없습니다.
                </div>
            )}
        </div>
    );
};

export default PendingRequests; 