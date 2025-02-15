import React, { useState, useEffect } from 'react';
import axios from '../api/axios';

interface User {
    id: number;
    email: string;
    is_admin: boolean;
}

interface Service {
    id: number;
    name: string;
    description: string;
}

interface ValidatedUser {
    email: string;
    user_id: number;
}

interface ValidationError {
    email: string;
    reason: string;
}

interface ValidationResult {
    valid_users: ValidatedUser[];
    not_found: ValidationError[];
    already_added: ValidatedUser[];
}

const ServiceUsers: React.FC = () => {
    const [services, setServices] = useState<Service[]>([]);
    const [selectedService, setSelectedService] = useState<string>('');
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
    const [showAddUsers, setShowAddUsers] = useState(false);
    const [emailInput, setEmailInput] = useState('');
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    const [showValidationStep, setShowValidationStep] = useState(false);
    const [addMethod, setAddMethod] = useState<'email' | 'select'>('email');
    const [availableUsers, setAvailableUsers] = useState<User[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchServices();
    }, []);

    useEffect(() => {
        if (selectedService) {
            fetchServiceUsers(selectedService);
            fetchAvailableUsers();
            setSelectedUsers([]); // 서비스 변경 시 선택 초기화
        }
    }, [selectedService]);

    const fetchServices = async () => {
        try {
            const response = await axios.get('/services');
            setServices(response.data);
        } catch (err) {
            setError('서비스 목록을 불러오는데 실패했습니다.');
        }
    };

    const fetchServiceUsers = async (serviceId: string) => {
        try {
            const response = await axios.get(`/services/${serviceId}/users`);
            setUsers(response.data);
        } catch (err) {
            setError('사용자 목록을 불러오는데 실패했습니다.');
        }
    };

    const fetchAvailableUsers = async () => {
        if (!selectedService) return;
        
        try {
            // 서비스별 사용 가능한 사용자 목록 조회
            const response = await axios.get(`/services/${selectedService}/available-users`);
            setAvailableUsers(response.data);
        } catch (err) {
            setError('추가 가능한 사용자 목록을 불러오는데 실패했습니다.');
        }
    };

    const handleRemoveAccess = async (userIds: number[]) => {
        if (!window.confirm(`선택한 ${userIds.length}명의 사용자 접근 권한을 해제하시겠습니까?`)) {
            return;
        }

        try {
            await Promise.all(
                userIds.map(userId =>
                    axios.delete(`/services/${selectedService}/users/${userId}`)
                )
            );
            setMessage({
                type: 'success',
                text: '선택한 사용자들의 서비스 접근 권한이 해제되었습니다.'
            });
            fetchServiceUsers(selectedService);
            setSelectedUsers([]); // 선택 초기화
        } catch (err: any) {
            setError(err.response?.data?.detail || '접근 권한 해제에 실패했습니다.');
        }
    };

    const handleSelectAll = () => {
        const nonAdminUsers = users.filter(user => !user.is_admin);
        if (selectedUsers.length === nonAdminUsers.length) {
            setSelectedUsers([]);
        } else {
            setSelectedUsers(nonAdminUsers.map(user => user.id));
        }
    };

    const handleSelectUser = (userId: number) => {
        setSelectedUsers(prev => {
            if (prev.includes(userId)) {
                return prev.filter(id => id !== userId);
            }
            return [...prev, userId];
        });
    };

    const handleValidateUsers = async () => {
        if (!emailInput.trim()) {
            setError('이메일을 입력해주세요.');
            return;
        }

        try {
            const response = await axios.post(`/services/${selectedService}/users/validate`, {
                emails: emailInput
            });
            setValidationResult(response.data);
            setShowValidationStep(true);
        } catch (err: any) {
            setError(err.response?.data?.detail || '사용자 검증에 실패했습니다.');
        }
    };

    const handleSelectUsersValidate = async () => {
        if (!selectedUserIds.length) {
            setError('사용자를 선택해주세요.');
            return;
        }

        try {
            const selectedEmails = availableUsers
                .filter(user => selectedUserIds.includes(user.id.toString()))
                .map(user => user.email)
                .join(',');

            const response = await axios.post(`/services/${selectedService}/users/validate`, {
                emails: selectedEmails
            });
            setValidationResult(response.data);
            setShowValidationStep(true);
        } catch (err: any) {
            setError(err.response?.data?.detail || '사용자 검증에 실패했습니다.');
        }
    };

    const handleAddValidatedUsers = async () => {
        if (!validationResult?.valid_users.length) {
            setError('추가할 수 있는 사용자가 없습니다.');
            return;
        }

        try {
            const emails = validationResult.valid_users.map(user => user.email).join(',');
            const response = await axios.post(`/services/${selectedService}/users`, {
                emails: emails
            });

            setMessage({
                type: 'success',
                text: `${response.data.success.length}명의 사용자가 추가되었습니다.`
            });

            // 모달 닫고 상태 초기화
            setEmailInput('');
            setShowAddUsers(false);
            setShowValidationStep(false);
            setValidationResult(null);
            // 사용자 목록 새로고침
            fetchServiceUsers(selectedService);
        } catch (err: any) {
            setError(err.response?.data?.detail || '사용자 추가에 실패했습니다.');
        }
    };

    const handleServiceChange = (serviceId: string) => {
        setSelectedService(serviceId);
        setSelectedUsers([]); // 선택된 사용자 초기화
        setSelectedUserIds([]); // 선택된 사용자 ID 초기화
        setShowAddUsers(false); // 모달 닫기
        setValidationResult(null); // 검증 결과 초기화
    };

    // 검색어에 따른 필터링된 서비스 목록
    const filteredServices = services.filter(service => 
        service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="container mx-auto p-4">
            <h2 className="text-2xl font-bold mb-6">서비스별 사용자 관리</h2>

            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-600 rounded">
                    {error}
                </div>
            )}
            {message && (
                <div className={`mb-4 p-3 rounded ${
                    message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                    {message.text}
                </div>
            )}

            {/* 검색 입력 필드 */}
            <div className="mb-4">
                <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        placeholder="서비스 검색..."
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

            <div className="mb-6">
                <select
                    value={selectedService}
                    onChange={(e) => handleServiceChange(e.target.value)}
                    className="p-2 border rounded w-full md:w-1/3"
                >
                    <option value="">서비스를 선택하세요</option>
                    {filteredServices.map(service => (
                        <option key={service.id} value={service.id}>
                            {service.name} ({service.description || '설명 없음'})
                        </option>
                    ))}
                </select>
            </div>

            {selectedService && (
                <>
                    <div className="mb-4 flex justify-between items-center">
                        <button
                            onClick={() => setShowAddUsers(true)}
                            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        >
                            사용자 추가
                        </button>
                        
                        {selectedUsers.length > 0 && (
                            <button
                                onClick={() => handleRemoveAccess(selectedUsers)}
                                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                            >
                                선택 접근 해제 ({selectedUsers.length})
                            </button>
                        )}
                    </div>

                    {/* 사용자 추가 모달 */}
                    {showAddUsers && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                            <div className="bg-white p-6 rounded-lg w-[600px]">
                                <h3 className="text-lg font-bold mb-4">사용자 추가</h3>
                                
                                {!showValidationStep ? (
                                    <>
                                        <div className="mb-4">
                                            <div className="flex gap-4 mb-4">
                                                <button
                                                    onClick={() => setAddMethod('email')}
                                                    className={`px-4 py-2 rounded ${
                                                        addMethod === 'email'
                                                            ? 'bg-blue-500 text-white'
                                                            : 'bg-gray-100'
                                                    }`}
                                                >
                                                    이메일 직접 입력
                                                </button>
                                                <button
                                                    onClick={() => setAddMethod('select')}
                                                    className={`px-4 py-2 rounded ${
                                                        addMethod === 'select'
                                                            ? 'bg-blue-500 text-white'
                                                            : 'bg-gray-100'
                                                    }`}
                                                >
                                                    목록에서 선택
                                                </button>
                                            </div>

                                            {addMethod === 'email' ? (
                                                <>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        이메일 주소 (쉼표로 구분)
                                                    </label>
                                                    <textarea
                                                        value={emailInput}
                                                        onChange={(e) => setEmailInput(e.target.value)}
                                                        placeholder={`example1@${process.env.REACT_APP_ALLOWED_DOMAIN}, example2@${process.env.REACT_APP_ALLOWED_DOMAIN}`}
                                                        className="w-full p-2 border rounded h-32"
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        사용자 선택 (다중 선택 가능)
                                                    </label>
                                                    <select
                                                        multiple
                                                        value={selectedUserIds}
                                                        onChange={(e) => {
                                                            const selected = Array.from(e.target.selectedOptions).map(option => option.value);
                                                            setSelectedUserIds(selected);
                                                        }}
                                                        className="w-full p-2 border rounded h-48"
                                                    >
                                                        {availableUsers.map(user => (
                                                            <option key={user.id} value={user.id}>
                                                                {user.email}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        Ctrl 또는 Cmd 키를 누른 상태로 클릭하여 여러 사용자를 선택할 수 있습니다.
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex justify-end space-x-2">
                                            <button
                                                onClick={() => setShowAddUsers(false)}
                                                className="px-4 py-2 border rounded hover:bg-gray-100"
                                            >
                                                취소
                                            </button>
                                            <button
                                                onClick={addMethod === 'email' ? handleValidateUsers : handleSelectUsersValidate}
                                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                            >
                                                다음
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="mb-4">
                                            <h4 className="font-medium mb-2">검증 결과</h4>
                                            {validationResult && (
                                                <>
                                                    {validationResult.valid_users.length > 0 && (
                                                        <div className="mb-4">
                                                            <h5 className="text-sm font-medium text-green-700 mb-1">
                                                                추가 가능한 사용자 ({validationResult.valid_users.length}명)
                                                            </h5>
                                                            <div className="bg-green-50 p-2 rounded">
                                                                {validationResult.valid_users.map(user => (
                                                                    <div key={user.user_id} className="text-sm">
                                                                        {user.email}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {validationResult.not_found.length > 0 && (
                                                        <div className="mb-4">
                                                            <h5 className="text-sm font-medium text-red-700 mb-1">
                                                                추가할 수 없는 사용자 ({validationResult.not_found.length}명)
                                                            </h5>
                                                            <div className="bg-red-50 p-2 rounded">
                                                                {validationResult.not_found.map((error, idx) => (
                                                                    <div key={idx} className="text-sm">
                                                                        {error.email} - {error.reason}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {validationResult.already_added.length > 0 && (
                                                        <div className="mb-4">
                                                            <h5 className="text-sm font-medium text-yellow-700 mb-1">
                                                                이미 추가된 사용자 ({validationResult.already_added.length}명)
                                                            </h5>
                                                            <div className="bg-yellow-50 p-2 rounded">
                                                                {validationResult.already_added.map(user => (
                                                                    <div key={user.user_id} className="text-sm">
                                                                        {user.email}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <div className="flex justify-end space-x-2">
                                            <button
                                                onClick={() => setShowValidationStep(false)}
                                                className="px-4 py-2 border rounded hover:bg-gray-100"
                                            >
                                                이전
                                            </button>
                                            <button
                                                onClick={handleAddValidatedUsers}
                                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                                disabled={!validationResult?.valid_users.length}
                                            >
                                                {validationResult?.valid_users.length || 0}명 추가하기
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="min-w-full bg-white">
                            <thead>
                                <tr>
                                    <th className="px-4 py-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedUsers.length === users.filter(user => !user.is_admin).length && users.length > 0}
                                            onChange={handleSelectAll}
                                            className="h-4 w-4"
                                        />
                                    </th>
                                    <th className="px-4 py-2">이메일</th>
                                    <th className="px-4 py-2">권한</th>
                                    <th className="px-4 py-2">작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="border px-4 py-2">
                                            {!user.is_admin && (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedUsers.includes(user.id)}
                                                    onChange={() => handleSelectUser(user.id)}
                                                    className="h-4 w-4"
                                                />
                                            )}
                                        </td>
                                        <td className="border px-4 py-2">{user.email}</td>
                                        <td className="border px-4 py-2">
                                            {user.is_admin ? '관리자' : '일반 사용자'}
                                        </td>
                                        <td className="border px-4 py-2">
                                            {!user.is_admin && (
                                                <button
                                                    onClick={() => handleRemoveAccess([user.id])}
                                                    className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                                                >
                                                    접근 해제
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {users.length === 0 && (
                            <div className="text-center text-gray-500 py-8">
                                이 서비스를 사용 중인 사용자가 없습니다.
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default ServiceUsers; 