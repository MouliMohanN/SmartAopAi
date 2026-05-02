import { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ResultChart } from './ResultChart';
import { ResultTable } from './ResultTable';
import { NarrativePanel } from './NarrativePanel';
import type { QueryResponse } from '../types';

interface Props {
  result: QueryResponse;
  narrative: string;
  narrativeDone: boolean;
  question: string;
}

export function ResultSection({ result, narrative, narrativeDone, question }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    if (!contentRef.current) return;
    setGenerating(true);

    try {
      const canvas = await html2canvas(contentRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;

      // Header
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(99, 102, 241); // accent color
      pdf.text('SmartAopAi', margin, margin);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(80, 80, 80);
      const wrappedQuestion = pdf.splitTextToSize(question, contentWidth);
      pdf.text(wrappedQuestion, margin, margin + 18);

      const questionBlockHeight = 18 + wrappedQuestion.length * 14;
      const startY = margin + questionBlockHeight + 10;

      // Divider line
      pdf.setDrawColor(220, 220, 220);
      pdf.line(margin, startY, pageWidth - margin, startY);

      // Chart + table + narrative image
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height / canvas.width) * imgWidth;

      let y = startY + 12;

      if (imgHeight <= pageHeight - y - margin) {
        pdf.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight);
      } else {
        // Slice image across pages
        const totalPages = Math.ceil(imgHeight / (pageHeight - y - margin));
        for (let page = 0; page < totalPages; page++) {
          if (page > 0) {
            pdf.addPage();
            y = margin;
          }
          const sliceH = pageHeight - y - margin;
          const sourceY = page * ((canvas.height / imgHeight) * sliceH);
          const sourceSliceH = (sliceH / imgHeight) * canvas.height;

          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sourceSliceH;
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceSliceH, 0, 0, canvas.width, sourceSliceH);

          const sliceImgData = sliceCanvas.toDataURL('image/png');
          pdf.addImage(sliceImgData, 'PNG', margin, y, imgWidth, sliceH);
        }
      }

      // Footer on last page
      pdf.setFontSize(8);
      pdf.setTextColor(180, 180, 180);
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      pdf.text(`Generated ${dateStr}`, margin, pageHeight - 20);

      const slug = question.slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      pdf.save(`smartaop-${slug}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="result-section slide-in">
      <div ref={contentRef} className="result-section-content">
        <ResultChart result={result} />
        <ResultTable result={result} />
        <NarrativePanel text={narrative} done={narrativeDone} />
      </div>

      {narrativeDone && (
        <div className="pdf-download-row">
          <button
            className={`pdf-download-btn ${generating ? 'pdf-download-btn--busy' : ''}`}
            onClick={handleDownload}
            disabled={generating}
            title="Download as PDF"
          >
            {generating ? (
              <>
                <span className="pdf-download-spinner" />
                Generating PDF…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1v9M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12h12v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                Download PDF
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
