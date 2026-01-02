'use client';

import { digitsOnly } from '@/lib/utils';

interface ExtraToolsProps {
    waNum: string;
    setWaNum: (val: string) => void;
}

export default function ExtraTools({ waNum, setWaNum }: ExtraToolsProps) {

    const handleOpen = () => {
        if (!waNum) return;
        window.open(`https://web.whatsapp.com/send?phone=${digitsOnly(waNum)}`, '_blank');
    };

    const handleCopy = () => {
        if (!waNum) return;
        navigator.clipboard.writeText(`https://web.whatsapp.com/send?phone=${digitsOnly(waNum)}`);
    };

    return (
        <div className="wa-tools" style={{ marginTop: '20px' }}>
            <div className="card">
                <span className="wa-title">Herramientas WhatsApp</span>
                <input
                    type="text"
                    className={`wa-input ${waNum ? 'picked' : ''}`}
                    placeholder="Pegar número aquí..."
                    value={waNum}
                    onChange={(e) => setWaNum(e.target.value)}
                />
                <div className="wa-actions">
                    <button className="btn teal" onClick={handleOpen}>Abrir Chat</button>
                    <button className="btn dark" onClick={handleCopy}>Copiar Link</button>
                    <button className="btn gray" onClick={() => setWaNum('')}>Limpiar</button>
                </div>
            </div>
        </div>
    );
}
