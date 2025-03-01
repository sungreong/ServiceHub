// frontend/src/components/MarkdownEditor.tsx
import React, { useState } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface MarkdownEditorProps {
  initialValue: string;
  onSave: (content: string) => void;
  placeholder?: string;
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ 
  initialValue, 
  onSave,
  placeholder = '마크다운 형식으로 내용을 작성하세요...' 
}) => {
  const [content, setContent] = useState(initialValue);
  const [isPreview, setIsPreview] = useState(false);

  const handleSave = () => {
    onSave(content);
  };

  return (
    <div className="markdown-editor">
      <div className="flex justify-between mb-2">
        <div className="tabs">
          <button 
            onClick={() => setIsPreview(false)}
            className={`px-4 py-2 ${!isPreview ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded-tl-md rounded-tr-md`}
          >
            편집
          </button>
          <button 
            onClick={() => setIsPreview(true)}
            className={`px-4 py-2 ${isPreview ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded-tl-md rounded-tr-md ml-1`}
          >
            미리보기
          </button>
        </div>
        <button 
          onClick={handleSave}
          className="px-4 py-2 bg-green-500 text-white rounded-md"
        >
          저장
        </button>
      </div>

      {isPreview ? (
        <div className="border rounded-md p-4 bg-white min-h-[200px]">
          <MarkdownRenderer content={content} />
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full border rounded-md p-4 min-h-[200px] font-mono"
          placeholder={placeholder}
        />
      )}

      <div className="mt-4 text-sm text-gray-500">
        <h3 className="font-bold mb-1">마크다운 형식 가이드:</h3>
        <ul className="list-disc pl-5">
          <li># 제목 (H1)</li>
          <li>## 부제목 (H2)</li>
          <li>**굵게**</li>
          <li>*기울임*</li>
          <li>[링크](URL)</li>
          <li>- 목록</li>
          <li>1. 번호 목록</li>
          <li>```코드 블록```</li>
        </ul>
      </div>
    </div>
  );
};

export default MarkdownEditor;