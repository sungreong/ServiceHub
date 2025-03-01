import React, { useState, useEffect } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import MarkdownEditor from './MarkdownEditor';
import instance from '../api/axios';

interface ServiceDocumentationProps {
  serviceId: string;
  initialContent?: string;
  isAdmin?: boolean;
  className?: string;
}

const ServiceDocumentation: React.FC<ServiceDocumentationProps> = ({
  serviceId,
  initialContent = '',
  isAdmin = false,
  className = ''
}) => {
  const [content, setContent] = useState<string>(initialContent);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialContent) {
      setContent(initialContent);
    } else {
      fetchDocumentation();
    }
  }, [serviceId, initialContent]);

  const fetchDocumentation = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await instance.get(`/services/${serviceId}/documentation`);
      if (response.data && response.data.content) {
        setContent(response.data.content);
      } else {
        // 문서가 없는 경우 기본 문서 템플릿 제공
        setContent('# 서비스 문서\n\n이 서비스에 대한 설명이 아직 작성되지 않았습니다.');
      }
    } catch (error) {
      console.error('서비스 문서 조회 중 오류 발생:', error);
      setError('서비스 문서를 불러오는데 실패했습니다.');
      // 오류 발생 시에도 기본 문서 템플릿 제공
      setContent('# 서비스 문서\n\n이 서비스에 대한 설명이 아직 작성되지 않았습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDocumentation = async (newContent: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await instance.put(`/services/${serviceId}/documentation`, {
        content: newContent
      });
      
      setContent(newContent);
      setIsEditing(false);
      alert('서비스 문서가 저장되었습니다.');
    } catch (error) {
      console.error('서비스 문서 저장 중 오류 발생:', error);
      setError('서비스 문서를 저장하는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`service-documentation ${className}`}>
      {error && (
        <div className="bg-red-100 text-red-600 p-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">서비스 문서</h2>
        {isAdmin && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
            disabled={isLoading}
          >
            {isLoading ? '로딩 중...' : '문서 편집'}
          </button>
        )}
      </div>
      
      {isLoading && !isEditing ? (
        <div className="text-gray-500 italic">문서를 불러오는 중...</div>
      ) : isEditing ? (
        <div className="mb-4">
          <MarkdownEditor
            initialValue={content}
            onSave={handleSaveDocumentation}
            placeholder="마크다운 형식으로 서비스 문서를 작성하세요..."
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm mr-2"
              disabled={isLoading}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="documentation-content bg-gray-50 p-4 rounded-lg">
          <MarkdownRenderer content={content} />
        </div>
      )}
    </div>
  );
};

export default ServiceDocumentation; 