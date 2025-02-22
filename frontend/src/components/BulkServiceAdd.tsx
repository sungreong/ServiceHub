import React, { useState, useRef } from 'react';
import axios from '../api/axios';

interface Service {
    name: string;
    protocol: 'http' | 'https';
    url: string;
    description?: string;
    show_info?: boolean;
}

interface SingleService {
    url: string;
    name: string;
    description: string;
}

interface Message {
    type: 'success' | 'error';
    text: string;
}

const BulkServiceAdd: React.FC = () => {
    const [singleService, setSingleService] = useState<SingleService>({ url: '', name: '', description: '' });
    const [jsonFile, setJsonFile] = useState<File | null>(null);
    const [error, setError] = useState<string>('');
    const [message, setMessage] = useState<Message | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const extractProtocolAndUrl = (fullUrl: string): { protocol: 'http' | 'https'; url: string } | null => {
        try {
            const url = new URL(fullUrl);
            const protocol = url.protocol.replace(':', '') as 'http' | 'https';
            
            // protocol을 제외한 나머지 부분을 url로 사용
            const urlWithoutProtocol = fullUrl.replace(url.protocol + '//', '');
            
            return {
                protocol,
                url: urlWithoutProtocol
            };
        } catch (err) {
            return null;
        }
    };

    const handleSingleServiceSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!singleService.url.trim() || !singleService.name.trim()) {
            setError('URL과 서비스명은 필수입니다.');
            return;
        }

        // URL 프로토콜 체크 및 추출
        const urlInfo = extractProtocolAndUrl(singleService.url.trim());
        if (!urlInfo) {
            setError('유효하지 않은 URL 형식입니다. http:// 또는 https://로 시작하는 전체 URL을 입력하세요.');
            return;
        }

        try {
            const serviceData: Service = {
                name: singleService.name.trim(),
                protocol: urlInfo.protocol,
                url: urlInfo.url,
                description: singleService.description.trim() || undefined,
                show_info: false
            };

            const response = await axios.post('/services', serviceData);
            
            setMessage({
                type: 'success',
                text: '서비스가 성공적으로 추가되었습니다.'
            });
            setSingleService({ url: '', name: '', description: '' });
        } catch (err: any) {
            const errorDetail = err.response?.data?.detail;
            if (typeof errorDetail === 'object') {
                // ValidationError 객체인 경우
                if (Array.isArray(errorDetail)) {
                    // 여러 개의 에러가 있는 경우
                    setError(errorDetail.map(e => e.msg).join('\n'));
                } else {
                    // 단일 에러 객체인 경우
                    setError(errorDetail.msg || JSON.stringify(errorDetail));
                }
            } else {
                // 문자열 에러인 경우
                setError(errorDetail || '서비스 추가에 실패했습니다.');
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setJsonFile(e.target.files[0]);
        }
    };

    const handleFileUpload = async () => {
        if (!jsonFile) {
            setError('업로드할 파일을 선택해주세요.');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('file', jsonFile);

            const response = await axios.post('/services/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            setMessage({
                type: 'success',
                text: `${response.data.success.length}개의 서비스가 추가되었습니다.`
            });

            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            setJsonFile(null);
        } catch (err: any) {
            const errorDetail = err.response?.data?.detail;
            if (typeof errorDetail === 'object') {
                // ValidationError 객체인 경우
                if (Array.isArray(errorDetail)) {
                    // 여러 개의 에러가 있는 경우
                    setError(errorDetail.map(e => e.msg).join('\n'));
                } else {
                    // 단일 에러 객체인 경우
                    setError(errorDetail.msg || JSON.stringify(errorDetail));
                }
            } else {
                // 문자열 에러인 경우
                setError(errorDetail || '파일 업로드에 실패했습니다.');
            }
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h2 className="text-2xl font-bold mb-6">서비스 추가</h2>

            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-600 rounded whitespace-pre-line">
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

            {/* 단일 서비스 추가 폼 */}
            <div className="mb-8 bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">단일 서비스 추가</h3>
                <form onSubmit={handleSingleServiceSubmit}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                서비스 URL *
                            </label>
                            <input
                                type="text"
                                value={singleService.url}
                                onChange={(e) => setSingleService({...singleService, url: e.target.value})}
                                placeholder="예: https://git.sparklingsoda.ai:8443/users/sign_in"
                                className="w-full px-3 py-2 border rounded-md"
                                required
                            />
                            <p className="mt-1 text-sm text-gray-500">
                                전체 URL을 입력하세요 (프로토콜, 호스트, 포트, 경로 포함)
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                서비스명 *
                            </label>
                            <input
                                type="text"
                                value={singleService.name}
                                onChange={(e) => setSingleService({...singleService, name: e.target.value})}
                                placeholder="서비스 이름을 입력하세요"
                                className="w-full px-3 py-2 border rounded-md"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                설명
                            </label>
                            <textarea
                                value={singleService.description}
                                onChange={(e) => setSingleService({...singleService, description: e.target.value})}
                                placeholder="서비스에 대한 설명을 입력하세요"
                                className="w-full px-3 py-2 border rounded-md"
                                rows={3}
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        >
                            서비스 추가
                        </button>
                    </div>
                </form>
            </div>

            {/* JSON 파일 업로드 */}
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">JSON 파일로 일괄 추가</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            JSON 파일 선택
                        </label>
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        <p className="mt-2 text-sm text-gray-500">
                            JSON 형식 예시:
                            <pre className="mt-1 bg-gray-50 p-2 rounded">
                                {JSON.stringify([
                                    {
                                        "name": "서비스명",
                                        "protocol": "https",
                                        "url": "git.sparklingsoda.ai:8443/users/sign_in",
                                        "description": "서비스 설명"
                                    }
                                ], null, 2)}
                            </pre>
                        </p>
                    </div>
                    <button
                        onClick={handleFileUpload}
                        disabled={!jsonFile}
                        className={`w-full px-4 py-2 rounded ${
                            jsonFile
                                ? 'bg-blue-500 text-white hover:bg-blue-600'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        파일 업로드
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BulkServiceAdd;