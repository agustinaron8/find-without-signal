import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOnline } from '../hooks/useOnline';

interface HeaderProps {
  title: string;
  backTo?: string;
}

export default function Header({ title, backTo }: HeaderProps) {
  const online = useOnline();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 bg-slate-950/95 px-4 py-3">
      {backTo && (
        <Link to={backTo} aria-label="Volver" className="-ml-2 p-2">
          <ArrowLeft size={24} />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{title}</h1>
      <span className={`flex items-center gap-1.5 text-xs ${online ? 'text-slate-400' : 'text-amber-300'}`}>
        <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        {online ? 'Con señal' : 'Sin señal'}
      </span>
    </header>
  );
}
