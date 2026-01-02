'use client';

import { useState, useEffect, useRef } from 'react';

interface AuthDialogProps {
    onAuth: () => void;
}

export default function AuthDialog({ onAuth }: AuthDialogProps) {
    const [pin, setPin] = useState('');
    const [open, setOpen] = useState(true);
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        // Check session storage on mount
        if (typeof window !== 'undefined' && sessionStorage.getItem('ms_auth') === 'ok') {
            setOpen(false);
            onAuth();
        } else {
            dialogRef.current?.showModal();
        }
    }, [onAuth]);

    const handleLogin = () => {
        if (pin === '4147') {
            sessionStorage.setItem('ms_auth', 'ok');
            setOpen(false);
            dialogRef.current?.close();
            onAuth();
        } else {
            alert('PIN incorrecto');
            setPin('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleLogin();
    };

    if (!open) return null;

    return (
        <dialog ref={dialogRef} id="dlgAuth" className="dialog" style={{ textAlign: 'center' }}>
            <h2>🔐 Acceso</h2>
            <p>Ingresa el PIN de seguridad</p>
            <input
                id="authPin"
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                style={{ fontSize: '24px', letterSpacing: '4px', textAlign: 'center', margin: '20px 0' }}
            />
            <br />
            <button id="btnAuth" className="btn primary" onClick={handleLogin}>
                Entrar
            </button>
        </dialog>
    );
}
