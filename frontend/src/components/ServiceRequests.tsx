import React, { useState, useEffect } from 'react';
import axios from '../api/axios';

interface Service {
    id: number;
    name: string;
    description: string;
}

interface User {
    email: string;
}

interface ServiceRequest {
    id: number;
    service: Service;
    user: User;
    status: string;
    request_date: string;
    response_date?: string;
}

const ServiceRequests: React.FC = () => {
    const [myRequests, setMyRequests] = useState<ServiceRequest[]>([]);
    const [availableServices, setAvailableServices] = useState<Service[]>([]);
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

    useEffect(() => {
        checkAdminStatus();
        fetchData();
    }, []);

    const checkAdminStatus = async () => {
        try {
            const response = await axios.get('/verify-token');
            setIsAdmin(response.data.is_admin);
        } catch (err) {
            console.error('Failed to verify admin status:', err);
        }
    };

    const fetchData = async () => {
        try {
            // 내 요청 목록 가져오기
            const myRequestsResponse = await axios.get('/my-service-requests');
            setMyRequests(myRequestsResponse.data);

            // 요청 가능한 서비스 목록 가져오기
            const availableResponse = await axios.get('/available-services');
            setAvailableServices(availableResponse.data);

            // 관리자인 경우 모든 요청 목록 가져오기
            if (isAdmin) {
                const allRequestsResponse = await axios.get('/service-requests');
                setAllRequests(allRequestsResponse.data);
            }
        } catch (err) {
            setError('데이터를 불러오는데 실패했습니다.');
        }
    };

    const handleNewRequest = async (serviceId: number) => {
        try {
            await axios.post('/service-requests', { service_id: serviceId });
            fetchData(); // 데이터 새로고침
        } catch (err) {
            setError('서비스 요청에 실패했습니다.');
        }
    };

    const handleRequestUpdate = async (requestId: number, status: string) => {
        try {
            const response = await axios.put(`/service-requests/${requestId}`, { status });
            if (response.data.status === 'success') {
                // 성공 메시지 표시
                setMessage({
                    type: 'success',
                    text: `요청이 ${status === 'approved' ? '승인' : '거절'}되었습니다.`
                });
                // 목록 새로고침
                fetchData();
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || '요청 처리에 실패했습니다.');
        }
    };

    const handleCancelRequest = async (requestId: number) => {
        if (!window.confirm('이 서비스 요청을 취소하시겠습니까?')) {
            return;
        }

        try {
            await axios.delete(`/service-requests/${requestId}`);
            setMessage({
                type: 'success',
                text: '서비스 요청이 취소되었습니다.'
            });
            fetchData(); // 목록 새로고침
        } catch (err: any) {
            setError(err.response?.data?.detail || '요청 취소에 실패했습니다.');
        }
    };

    // 관리자용 요청 목록 테이블
    const AdminRequestsTable = () => (
        <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
                <thead>
                    <tr>
                        <th className="px-4 py-2">요청일</th>
                        <th className="px-4 py-2">사용자</th>
                        <th className="px-4 py-2">서비스</th>
                        <th className="px-4 py-2">상태</th>
                        <th className="px-4 py-2">작업</th>
                    </tr>
                </thead>
                <tbody>
                    {allRequests.map((request) => (
                        <tr key={request.id} className={`
                            ${request.status === 'pending' ? 'bg-yellow-50' : 
                              request.status === 'approved' ? 'bg-green-50' : 'bg-red-50'}
                        `}>
                            <td className="border px-4 py-2">
                                {new Date(request.request_date).toLocaleString()}
                            </td>
                            <td className="border px-4 py-2">{request.user.email}</td>
                            <td className="border px-4 py-2">{request.service.name}</td>
                            <td className="border px-4 py-2">
                                <span className={`px-2 py-1 rounded ${
                                    request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    request.status === 'approved' ? 'bg-green-100 text-green-800' :
                                    'bg-red-100 text-red-800'
                                }`}>
                                    {request.status === 'pending' ? '대기중' :
                                     request.status === 'approved' ? '승인됨' : '거절됨'}
                                </span>
                            </td>
                            <td className="border px-4 py-2">
                                {request.status === 'pending' && (
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
    );

    return (
        <div className="container mx-auto p-4">
            {/* 에러/성공 메시지 */}
            {error && (
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

            {/* 새 서비스 요청 섹션 */}
            <div className="mb-8">
                <h2 className="text-2xl font-bold mb-4">요청 가능한 서비스 목록</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                        <thead>
                            <tr>
                                <th className="px-4 py-2">서비스명</th>
                                <th className="px-4 py-2">설명</th>
                                <th className="px-4 py-2">작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {availableServices.map((service) => (
                                <tr key={service.id} className="hover:bg-gray-50">
                                    <td className="border px-4 py-2 font-medium">
                                        {service.name}
                                    </td>
                                    <td className="border px-4 py-2">
                                        {/* 설명이 길면 잘라서 표시 */}
                                        {service.description.length > 50 
                                            ? `${service.description.substring(0, 50)}...` 
                                            : service.description}
                                    </td>
                                    <td className="border px-4 py-2">
                                        <button
                                            onClick={() => handleNewRequest(service.id)}
                                            className="bg-blue-500 text-white px-4 py-1 rounded hover:bg-blue-600 text-sm"
                                        >
                                            요청하기
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {availableServices.length === 0 && (
                    <div className="text-center text-gray-500 py-4">
                        요청 가능한 서비스가 없습니다.
                    </div>
                )}
            </div>

            {/* 내 요청 목록 */}
            <div className="mb-8">
                <h2 className="text-2xl font-bold mb-4">내 요청 목록</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                        <thead>
                            <tr>
                                <th className="px-4 py-2">서비스</th>
                                <th className="px-4 py-2">요청일</th>
                                <th className="px-4 py-2">상태</th>
                                <th className="px-4 py-2">응답일</th>
                                <th className="px-4 py-2">작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {myRequests.map((request) => (
                                <tr key={request.id}>
                                    <td className="border px-4 py-2">{request.service.name}</td>
                                    <td className="border px-4 py-2">
                                        {new Date(request.request_date).toLocaleDateString()}
                                    </td>
                                    <td className="border px-4 py-2">
                                        <span className={`px-2 py-1 rounded ${
                                            request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                            request.status === 'approved' ? 'bg-green-100 text-green-800' :
                                            'bg-red-100 text-red-800'
                                        }`}>
                                            {request.status === 'pending' ? '대기중' :
                                             request.status === 'approved' ? '승인됨' : '거절됨'}
                                        </span>
                                    </td>
                                    <td className="border px-4 py-2">
                                        {request.response_date ? 
                                            new Date(request.response_date).toLocaleDateString() : 
                                            '-'}
                                    </td>
                                    <td className="border px-4 py-2">
                                        {request.status === 'pending' && (
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={() => handleCancelRequest(request.id)}
                                                    className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                                                >
                                                    취소
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 관리자용: 모든 요청 목록 */}
            {isAdmin && (
                <div>
                    <h2 className="text-2xl font-bold mb-4">모든 서비스 요청</h2>
                    <AdminRequestsTable />
                </div>
            )}
        </div>
    );
};

export default ServiceRequests; 