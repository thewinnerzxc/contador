import { Counters } from '@/types';

interface StatsProps {
    stats: Counters;
}

export default function Stats({ stats }: StatsProps) {
    return (
        <div className="summary">
            <div className="card">
                <div className="k">Consulta WhatsApp resuelta</div>
                <div className="v" id="c2">{stats[2]}</div>
            </div>
            <div className="card">
                <div className="k">Consulta Email resuelta</div>
                <div className="v" id="c3">{stats[3]}</div>
            </div>
            <div className="card">
                <div className="k">Total registrados</div>
                <div className="v" id="ct">{stats.t}</div>
            </div>
        </div>
    );
}
