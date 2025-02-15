import React, { useState, useRef } from 'react';
import axios from '../api/axios';

interface User {
    email: string;
    password: string;
    is_admin?: boolean;
}

const BulkUserAdd: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
    const [jsonFile, setJsonFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setJsonFile(e.target.files[0]);
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target?.result as string);
                    setUsers(json);
                    setError('');
                } catch (err) {
                    setError('유효하지 않은 JSON 형식입니다.');
                }
            };
            reader.readAsText(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!jsonFile) {
            setError('파일을 선택해주세요.');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('file', jsonFile);

            const response = await axios.post('/users/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            setMessage({
                type: 'success',
                text: `${response.data.success.length}명의 사용자가 추가되었습니다.`
            });

            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            setJsonFile(null);
            setUsers([]);
        } catch (err: any) {
            setError(err.response?.data?.detail || '사용자 추가에 실패했습니다.');
        }
    };

    const handleAddAll = async () => {
        if (users.length === 0) {
            setError('추가할 사용자가 없습니다.');
            return;
        }

        try {
            const response = await axios.post('/users/bulk', {
                users: users
            });

            setMessage({
                type: 'success',
                text: `${response.data.success.length}명의 사용자가 추가되었습니다.`
            });

            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            setJsonFile(null);
            setUsers([]);
        } catch (err: any) {
            setError(err.response?.data?.detail || '사용자 추가에 실패했습니다.');
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h2 className="text-2xl font-bold mb-6">사용자 일괄 추가</h2>

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

            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    JSON 파일 업로드
                </label>
                <input
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="mt-1 text-sm text-gray-500">
                    JSON 형식:
                    <pre className="mt-1 bg-gray-50 p-2 rounded">
                        {JSON.stringify([
                            {
                                email: `user@${process.env.REACT_APP_ALLOWED_DOMAIN}`,
                                password: "password123",
                                is_admin: false
                            }
                        ], null, 2)}
                    </pre>
                </p>
            </div>

            {users.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-2">추가될 사용자 목록</h3>
                    <div className="bg-gray-50 p-4 rounded">
                        {users.map((user, index) => (
                            <div key={index} className="mb-2">
                                <span className="font-medium">{user.email}</span>
                                <span className="text-gray-600 ml-2">
                                    ({user.is_admin ? '관리자' : '일반 사용자'})
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex gap-4">
                <button
                    onClick={handleUpload}
                    disabled={!jsonFile}
                    className={`px-4 py-2 rounded ${
                        jsonFile
                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    파일 업로드
                </button>
                <button
                    onClick={handleAddAll}
                    disabled={users.length === 0}
                    className={`px-4 py-2 rounded ${
                        users.length > 0
                            ? 'bg-green-500 text-white hover:bg-green-600'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    전체 추가 ({users.length})
                </button>
            </div>
        </div>
    );
};

export default BulkUserAdd; 