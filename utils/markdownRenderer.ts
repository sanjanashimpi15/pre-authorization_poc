
export const renderMarkdownToHTML = (text: string): string => {
    // 1. Header Processing with Enhanced SOAP visual appeal
    let processedText = text
        // Subjective - Blue Theme
        .replace(/^##\s*Subjective/gim, 
            '<div class="mb-8 overflow-hidden rounded-2xl border border-blue-500/30 bg-blue-500/5">' +
            '<h2 class="px-5 py-3 text-sm font-black uppercase tracking-widest text-blue-400 border-b border-blue-500/20 flex items-center gap-3">' +
            '<span class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>' +
            'Subjective</h2>' +
            '<div class="p-5 text-blue-50/80 prose-sm">')
        
        // Objective - Red Theme
        .replace(/^##\s*Objective/gim, 
            '</div></div>' +
            '<div class="mb-8 overflow-hidden rounded-2xl border border-red-500/30 bg-red-500/5">' +
            '<h2 class="px-5 py-3 text-sm font-black uppercase tracking-widest text-red-400 border-b border-red-500/20 flex items-center gap-3">' +
            '<span class="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>' +
            'Objective</h2>' +
            '<div class="p-5 text-red-50/80 prose-sm">')
        
        // Assessment - Green Theme
        .replace(/^##\s*Assessment/gim, 
            '</div></div>' +
            '<div class="mb-8 overflow-hidden rounded-2xl border border-green-500/30 bg-green-500/5">' +
            '<h2 class="px-5 py-3 text-sm font-black uppercase tracking-widest text-green-400 border-b border-green-500/20 flex items-center gap-3">' +
            '<span class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>' +
            'Assessment</h2>' +
            '<div class="p-5 text-green-50/80 prose-sm">')
        
        // Plan - Amber Theme
        .replace(/^##\s*Plan/gim, 
            '</div></div>' +
            '<div class="mb-8 overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/5">' +
            '<h2 class="px-5 py-3 text-sm font-black uppercase tracking-widest text-amber-400 border-b border-amber-500/20 flex items-center gap-3">' +
            '<span class="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></span>' +
            'Plan</h2>' +
            '<div class="p-5 text-amber-50/80 prose-sm">')
            
        .replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold mt-4 mb-2 opacity-90">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-base font-black uppercase tracking-wider mt-6 mb-4 border-b border-white/10 pb-2">$1</h2>');

    // Close the last div if SOAP was used
    if (processedText.includes('class="p-5')) {
        processedText += '</div></div>';
    }

    // 2. Text Formatting
    processedText = processedText
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="opacity-70">$1</em>');

    // 3. Block Processing
    const lines = processedText.split('\n');
    let html = '';
    let inList = false;

    for (const line of lines) {
        const trimmed = line.trim();
        
        if (!trimmed) continue;

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const content = trimmed.substring(2);
            if (!inList) {
                inList = true;
                html += '<ul class="list-disc list-outside ml-4 space-y-1 mb-4 opacity-90 text-sm leading-relaxed">';
            }
            html += `<li>${content}</li>`;
        } else {
            if (inList) {
                inList = false;
                html += '</ul>';
            }
            
            if (trimmed.startsWith('<div') || trimmed.startsWith('</div') || trimmed.startsWith('<h')) {
                html += trimmed;
            } else {
                html += `<p class="mb-3 opacity-80 text-sm leading-relaxed">${trimmed}</p>`;
            }
        }
    }
    
    if (inList) html += '</ul>';

    return html;
};
