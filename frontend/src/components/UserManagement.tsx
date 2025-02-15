import React, { useState, useEffect } from 'react';
import axios from '../api/axios';

interface User {
    id: number;
    email: string;
    is_admin: boolean;
    status: 'pending' | 'approved' | 'rejected';
    registration_date: string;
    approval_date?: string;
}

const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [pendingUsers, setPendingUsers] = useState<User[]>([]);
    const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
    const [selectedPendingUsers, setSelectedPendingUsers] = useState<number[]>([]);

    useEffect(() => {
        fetchUsers();
        fetchPendingUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/users');
            setUsers(response.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || '사용자 목록을 불러오는데 실패했습니다.');
        }
    };

    const fetchPendingUsers = async () => {
        try {
            const response = await axios.get('/users/pending');
            setPendingUsers(response.data);
        } catch (err) {
            setError('승인 대기 중인 사용자 목록을 불러오는데 실패했습니다.');
        }
    };

    // 검색어에 따른 필터링된 사용자 목록
    const filteredUsers = users.filter(user => 
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // 필터링된 사용자들 중 일반 사용자만 선택
    const filteredNonAdminUsers = filteredUsers.filter(user => !user.is_admin);

    const handleSelectAll = () => {
        if (selectedUsers.length === filteredNonAdminUsers.length) {
            // 모두 선택된 상태면 선택 해제
            setSelectedUsers([]);
        } else {
            // 필터링된 일반 사용자들만 선택
            setSelectedUsers(filteredNonAdminUsers.map(user => user.id));
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

    const handleUpdateAdmin = async (userId: number, isAdmin: boolean) => {
        try {
            await axios.put(`/users/${userId}`, {
                is_admin: isAdmin
            });
            
            setMessage({
                type: 'success',
                text: '사용자 권한이 업데이트되었습니다.'
            });
            
            fetchUsers();
        } catch (err: any) {
            setError(err.response?.data?.detail || '권한 변경에 실패했습니다.');
        }
    };

    const handleApprove = async (userId: number) => {
        try {
            await axios.put(`/users/${userId}/status`, {
                status: 'approved'
            });
            setMessage({
                type: 'success',
                text: '사용자가 승인되었습니다.'
            });
            fetchUsers();
            fetchPendingUsers();
        } catch (err) {
            setError('사용자 승인에 실패했습니다.');
        }
    };

    const handleReject = async (userId: number) => {
        if (!window.confirm('정말 이 사용자의 가입을 거절하시겠습니까?')) {
            return;
        }

        try {
            await axios.put(`/users/${userId}/status`, {
                status: 'rejected'
            });
            setMessage({
                type: 'success',
                text: '사용자가 거절되었습니다.'
            });
            fetchUsers();
            fetchPendingUsers();
        } catch (err) {
            setError('사용자 거절에 실패했습니다.');
        }
    };

    // 승인 대기 사용자 전체 선택/해제
    const handleSelectAllPending = () => {
        if (selectedPendingUsers.length === pendingUsers.length) {
            setSelectedPendingUsers([]);
        } else {
            setSelectedPendingUsers(pendingUsers.map(user => user.id));
        }
    };

    // 개별 승인 대기 사용자 선택/해제
    const handleSelectPendingUser = (userId: number) => {
        setSelectedPendingUsers(prev => {
            if (prev.includes(userId)) {
                return prev.filter(id => id !== userId);
            }
            return [...prev, userId];
        });
    };

    // 선택된 사용자들 일괄 승인
    const handleBulkApprove = async () => {
        if (!window.confirm(`선택한 ${selectedPendingUsers.length}명의 사용자를 승인하시겠습니까?`)) {
            return;
        }

        try {
            await Promise.all(
                selectedPendingUsers.map(userId =>
                    axios.put(`/users/${userId}/status`, {
                        status: 'approved'
                    })
                )
            );
            setMessage({
                type: 'success',
                text: `${selectedPendingUsers.length}명의 사용자가 승인되었습니다.`
            });
            fetchUsers();
            fetchPendingUsers();
            setSelectedPendingUsers([]); // 선택 초기화
        } catch (err) {
            setError('일괄 승인 처리에 실패했습니다.');
        }
    };

    // 선택된 사용자들 일괄 거절
    const handleBulkReject = async () => {
        if (!window.confirm(`선택한 ${selectedPendingUsers.length}명의 사용자를 거절하시겠습니까?`)) {
            return;
        }

        try {
            await Promise.all(
                selectedPendingUsers.map(userId =>
                    axios.put(`/users/${userId}/status`, {
                        status: 'rejected'
                    })
                )
            );
            setMessage({
                type: 'success',
                text: `${selectedPendingUsers.length}명의 사용자가 거절되었습니다.`
            });
            fetchUsers();
            fetchPendingUsers();
            setSelectedPendingUsers([]); // 선택 초기화
        } catch (err) {
            setError('일괄 거절 처리에 실패했습니다.');
        }
    };

    // 선택된 사용자들 일괄 삭제
    const handleBulkDelete = async () => {
        if (!window.confirm(`선택한 ${selectedUsers.length}명의 사용자를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
            return;
        }

        try {
            await Promise.all(
                selectedUsers.map(userId =>
                    axios.delete(`/users/${userId}`)
                )
            );
            setMessage({
                type: 'success',
                text: `${selectedUsers.length}명의 사용자가 삭제되었습니다.`
            });
            fetchUsers();
            setSelectedUsers([]); // 선택 초기화
        } catch (err) {
            setError('일괄 삭제 처리에 실패했습니다.');
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h2 className="text-2xl font-bold mb-6">사용자 관리</h2>

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

            {/* 탭 메뉴 */}
            <div className="mb-6">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex">
                        <button
                            onClick={() => setActiveTab('all')}
                            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'all'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            전체 사용자
                        </button>
                        <button
                            onClick={() => setActiveTab('pending')}
                            className={`py-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'pending'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            승인 대기 ({pendingUsers.length})
                        </button>
                    </nav>
                </div>
            </div>

            {/* 검색 입력 필드 */}
            <div className="mb-4">
                <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        placeholder="이메일로 검색..."
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
                        검색 결과: {filteredUsers.length}명의 사용자
                    </p>
                )}
            </div>

            {activeTab === 'all' ? (
                <div className="overflow-x-auto">
                    {/* 선택된 사용자 삭제 버튼 */}
                    <div className="mb-4">
                        {selectedUsers.length > 0 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={handleBulkDelete}
                                    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                                >
                                    선택 삭제 ({selectedUsers.length})
                                </button>
                            </div>
                        )}
                    </div>

                    <table className="min-w-full bg-white">
                        <thead>
                            <tr>
                                <th className="px-4 py-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedUsers.length === filteredNonAdminUsers.length && filteredNonAdminUsers.length > 0}
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
                            {filteredUsers.map((user) => (
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
                                                onClick={() => handleUpdateAdmin(user.id, !user.is_admin)}
                                                className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                                            >
                                                관리자로 변경
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredUsers.length === 0 && (
                        <div className="text-center text-gray-500 py-8">
                            {searchTerm ? '검색 결과가 없습니다.' : '등록된 사용자가 없습니다.'}
                        </div>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <div className="mb-4">
                        {selectedPendingUsers.length > 0 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={handleBulkApprove}
                                    className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                                >
                                    선택 승인 ({selectedPendingUsers.length})
                                </button>
                                <button
                                    onClick={handleBulkReject}
                                    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                                >
                                    선택 거절 ({selectedPendingUsers.length})
                                </button>
                            </div>
                        )}
                    </div>
                    <table className="min-w-full bg-white">
                        <thead>
                            <tr>
                                <th className="px-4 py-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedPendingUsers.length === pendingUsers.length && pendingUsers.length > 0}
                                        onChange={handleSelectAllPending}
                                        className="h-4 w-4"
                                    />
                                </th>
                                <th className="px-4 py-2">이메일</th>
                                <th className="px-4 py-2">가입 신청일</th>
                                <th className="px-4 py-2">작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50">
                                    <td className="border px-4 py-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedPendingUsers.includes(user.id)}
                                            onChange={() => handleSelectPendingUser(user.id)}
                                            className="h-4 w-4"
                                        />
                                    </td>
                                    <td className="border px-4 py-2">{user.email}</td>
                                    <td className="border px-4 py-2">
                                        {new Date(user.registration_date).toLocaleString()}
                                    </td>
                                    <td className="border px-4 py-2">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleApprove(user.id)}
                                                className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                                            >
                                                승인
                                            </button>
                                            <button
                                                onClick={() => handleReject(user.id)}
                                                className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                                            >
                                                거절
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {pendingUsers.length === 0 && (
                        <div className="text-center text-gray-500 py-8">
                            승인 대기 중인 사용자가 없습니다.
                        </div>
                    )}
                </div>
            )}

            {selectedUsers.length > 0 && (
                <div className="mt-4 p-4 bg-gray-100 rounded flex justify-between items-center">
                    <span className="text-gray-700">
                        {selectedUsers.length}명의 사용자 선택됨
                    </span>
                    <button
                        onClick={() => setSelectedUsers([])}
                        className="text-red-600 hover:text-red-800"
                    >
                        선택 해제
                    </button>
                </div>
            )}
        </div>
    );
};

export default UserManagement; 