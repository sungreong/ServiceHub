import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import { useParams } from 'react-router-dom';

interface User {
    id: number;
    email: string;
    show_info: boolean;  // show_info? 에서 show_info로 변경
}

interface ServiceUser {
    user_id: number;
    service_id: number;
    show_info: boolean;
}

interface AddUserFormData {
    emails: string;
    showInfo: boolean;  // IP:PORT 정보 공개 여부
}

interface SelectedUser {
    id: number;
    email: string;
}

const ServiceUserManagement = () => {
    const { serviceId } = useParams<{ serviceId: string }>();
    const [users, setUsers] = useState<User[]>([]);
    const [availableUsers, setAvailableUsers] = useState<User[]>([]);
    const [formData, setFormData] = useState<AddUserFormData>({
        emails: '',
        showInfo: false
    });
    const [error, setError] = useState('');
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
    const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);

    useEffect(() => {
        fetchUsers();
        fetchAvailableUsers();
    }, [serviceId]);

    const fetchUsers = async () => {
        try {
            const response = await axios.get(`/services/${serviceId}/users`);
            setUsers(response.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || '사용자 목록을 불러오는데 실패했습니다.');
        }
    };

    const fetchAvailableUsers = async () => {
        try {
            const response = await axios.get(`/services/${serviceId}/available-users`);
            setAvailableUsers(response.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || '추가 가능한 사용자 목록을 불러오는데 실패했습니다.');
        }
    };

    const handleUserSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions);
        const newSelectedUsers = selectedOptions.map(option => ({
            id: parseInt(option.value),
            email: option.getAttribute('data-email') || ''
        }));
        setSelectedUsers(newSelectedUsers);
        
        // emails 문자열 업데이트
        const emailString = newSelectedUsers.map(user => user.email).join(', ');
        setFormData(prev => ({
            ...prev,
            emails: emailString
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        try {
            const response = await axios.post(`/services/${serviceId}/users`, {
                emails: formData.emails,
                showInfo: formData.showInfo
            });

            if (response.data.success.length > 0) {
                setMessage({
                    type: 'success',
                    text: `${response.data.success.length}명의 사용자가 추가되었습니다.`
                });
            }

            if (response.data.already_added.length > 0) {
                setMessage(prev => ({
                    type: 'info',
                    text: `${prev?.text || ''}\n${response.data.already_added.length}명의 사용자는 이미 추가되어 있습니다.`
                }));
            }
            
            // 폼 초기화
            setFormData({
                emails: '',
                showInfo: false
            });
            setSelectedUsers([]);
            
            // 목록 새로고침
            await fetchUsers();
            await fetchAvailableUsers();
        } catch (err: any) {
            setError(err.response?.data?.detail || '사용자 추가에 실패했습니다.');
        }
    };

    // 사용자별 정보 공개 여부 변경 처리
    const handleShowInfoChange = async (userId: number, showInfo: boolean) => {
        try {
            await axios.put(`/services/${serviceId}/users/${userId}`, {
                show_info: showInfo
            });
            
            await fetchUsers();
            
            setMessage({
                type: 'success',
                text: '정보 공개 설정이 변경되었습니다.'
            });

            setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
            const errorMsg = err.response?.data?.detail || '설정 변경에 실패했습니다.';
            setError(errorMsg);
            setTimeout(() => setError(''), 3000);
            await fetchUsers(); // 상태 복구
        }
    };

    // 사용자 삭제 처리 함수
    const handleUserRemove = async (userId: number) => {
        if (!window.confirm('이 사용자의 서비스 접근을 해제하시겠습니까?')) {
            return;
        }

        try {
            const response = await axios.delete(`/services/${serviceId}/users/${userId}`);
            
            if (response.data.status === 'success') {
                setMessage({
                    type: 'success',
                    text: '사용자 접근이 해제되었습니다.'
                });
                await fetchUsers();
            }

            setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
            const errorMsg = err.response?.data?.detail || '사용자 접근 해제에 실패했습니다.';
            
            if (err.response?.status === 403) {
                // 권한이 없는 경우 접근 해제 요청으로 전환
                try {
                    await axios.post(`/services/${serviceId}/users/${userId}/remove-request`, {
                        user_id: userId,
                        service_id: serviceId
                    });
                    
                    setMessage({
                        type: 'success',
                        text: '사용자 접근 해제 요청이 등록되었습니다. 관리자 승인을 기다려주세요.'
                    });
                    await fetchUsers();
                } catch (requestErr: any) {
                    setError(requestErr.response?.data?.detail || '접근 해제 요청에 실패했습니다.');
                }
            } else {
                setError(errorMsg);
            }
            
            setTimeout(() => setError(''), 3000);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h2 className="text-2xl font-bold mb-6">서비스 사용자 관리</h2>
            
            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-600 rounded">
                    {error}
                </div>
            )}
            {message && (
                <div className={`p-3 rounded mb-4 ${
                    message.type === 'success' ? 'bg-green-100 text-green-700' : 
                    message.type === 'info' ? 'bg-blue-100 text-blue-700' :
                    'bg-red-100 text-red-700'
                }`}>
                    {message.text.split('\n').map((line, i) => (
                        <p key={i}>{line}</p>
                    ))}
                </div>
            )}
            
            {/* 사용자 추가 폼 수정 */}
            <form onSubmit={handleSubmit} className="mb-8">
                <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-bold mb-2">
                        추가할 사용자 선택
                    </label>
                    <select
                        multiple
                        value={selectedUsers.map(user => user.id.toString())}
                        onChange={handleUserSelect}
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline h-48"
                    >
                        {availableUsers.map(user => (
                            <option 
                                key={user.id} 
                                value={user.id}
                                data-email={user.email}
                            >
                                {user.email}
                            </option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                        Ctrl 또는 Shift를 누른 상태로 여러 사용자를 선택할 수 있습니다.
                    </p>
                </div>
                
                <div className="mb-4">
                    <label className="flex items-center">
                        <input
                            type="checkbox"
                            checked={formData.showInfo}
                            onChange={(e) => setFormData(prev => ({ ...prev, showInfo: e.target.checked }))}
                            className="mr-2"
                        />
                        <span className="text-sm text-gray-700">IP:PORT 정보 공개</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                        체크하면 추가되는 사용자들에게 서비스의 IP:PORT 정보가 표시됩니다.
                        각 사용자별로 나중에 개별적으로 변경할 수 있습니다.
                    </p>
                </div>

                <button
                    type="submit"
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                >
                    사용자 추가
                </button>
            </form>

            {/* 현재 사용자 목록 */}
            <div className="mt-8">
                <h3 className="text-xl font-semibold mb-4">현재 사용자 목록</h3>
                <div className="bg-white shadow overflow-hidden rounded-lg">
                    {users.length > 0 ? (
                        <table className="min-w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        이메일
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        정보 공개
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        작업
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {users.map(user => (
                                    <tr key={user.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {user.email}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <label className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={user.show_info || false}
                                                    onChange={(e) => handleShowInfoChange(user.id, e.target.checked)}
                                                    className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                />
                                                <span className="text-sm text-gray-700">
                                                    IP:PORT 정보 공개
                                                </span>
                                            </label>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={() => handleUserRemove(user.id)}
                                                className="text-red-600 hover:text-red-900 text-sm font-medium"
                                            >
                                                접근 해제
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-4 text-gray-500">
                            등록된 사용자가 없습니다.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ServiceUserManagement; 