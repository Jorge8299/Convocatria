import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Send, 
  Copy, 
  Trash2, 
  ChevronDown, 
  Info,
  CheckCircle2,
  Trophy,
  Plus,
  X,
  Settings2,
  Home,
  Plane
} from 'lucide-react';

interface Rival {
  id: string;
  nombre: string;
  campo: string;
}

const RIVALES_INICIALES: Rival[] = [
  { id: '1', nombre: "Racing d'Algemesí 'B'", campo: "Estadio Municipal de Algemesí" },
  { id: '2', nombre: "Benigànim C.F. 'B'", campo: "Campo Municipal de Benigànim" },
  { id: '3', nombre: "U.D. Alzira 'B'", campo: "Estadio Luis Suñer Picó" },
  { id: '4', nombre: "Ciutat de Xàtiva C.F.B. 'B'", campo: "Campo Municipal Paquito Coloma" },
  { id: '5', nombre: "C.D. L'Alcúdia de Crespins 'B'", campo: "Campo Municipal José Gramage" },
  { id: '6', nombre: "Picassent C.F. 'C'", campo: "Polideportivo Municipal de Picassent" },
  { id: '7', nombre: "Algemesí C.F. 'B'", campo: "Estadio Municipal de Algemesí" },
  { id: '8', nombre: "C.F.B. Castelló de La Ribera 'B'", campo: "Campo Municipal de Castelló" },
  { id: '9', nombre: "C.F. Gandia 'D'", campo: "Estadio Guillermo Olagüe" },
];

const CAMPOS_CASA = ["El Morer", "Campo C", "Polideportivo"];
const LUGARES_CITACION = ["El Morer", "Parking del LIDL"];

interface Citacion {
  id: string;
  hora: string;
  lugar: string;
  lugarPersonalizado: string;
}

interface PartidoTorneo {
  id: string;
  rival: string;
  hora: string;
}

interface FormData {
  equipoPropio: string;
  tipoPartido: 'liga' | 'amistoso' | 'torneo';
  rivalId: string;
  rivalManual: string;
  esCasa: boolean;
  fecha: string;
  hora: string;
  campoPropio: string;
  campoRivalEditado: string;
  campoManual: string;
  citaciones: Citacion[];
  partidosTorneo: PartidoTorneo[];
  observaciones: string;
  addCierre: boolean;
  addCorazon: boolean;
}

const INITIAL_STATE: FormData = {
  equipoPropio: "U.D. OLIVA",
  tipoPartido: 'liga',
  rivalId: "",
  rivalManual: "",
  esCasa: true,
  fecha: "",
  hora: "",
  campoPropio: "",
  campoRivalEditado: "",
  campoManual: "",
  citaciones: [{ id: '1', hora: '', lugar: "", lugarPersonalizado: '' }],
  partidosTorneo: [{ id: '1', rival: '', hora: '' }],
  observaciones: "",
  addCierre: true,
  addCorazon: true,
};

export default function App() {
  const [formData, setFormData] = useState<FormData>(INITIAL_STATE);

  const [rivales, setRivales] = useState<Rival[]>(() => {
    const saved = localStorage.getItem('convocatoria_rivales');
    return saved ? JSON.parse(saved) : RIVALES_INICIALES;
  });

  const [isEditingRivales, setIsEditingRivales] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    localStorage.setItem('convocatoria_rivales', JSON.stringify(rivales));
  }, [rivales]);

  const calculateCitacionTime = (matchTime: string, isCasa: boolean) => {
    if (!matchTime) return "";
    const [hours, minutes] = matchTime.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    
    // Restar tiempo (60 min si casa, 90 min si fuera)
    const minutesToSubtract = isCasa ? 60 : 90;
    date.setMinutes(date.getMinutes() - minutesToSubtract);
    
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    
    if (name === 'esCasa') {
      const newEsCasa = value === 'true';
      setFormData(prev => {
        const newCitacionTime = calculateCitacionTime(prev.hora, newEsCasa);
        return { 
          ...prev, 
          esCasa: newEsCasa,
          citaciones: prev.citaciones.map((c, i) => i === 0 ? { ...c, hora: newCitacionTime } : c)
        };
      });
    } else if (name === 'rivalId') {
      const selectedRival = rivales.find(r => r.id === value);
      setFormData(prev => ({ 
        ...prev, 
        rivalId: value,
        campoRivalEditado: selectedRival ? selectedRival.campo : prev.campoRivalEditado
      }));
    } else if (name === 'hora') {
      setFormData(prev => {
        const newCitacionTime = calculateCitacionTime(value as string, prev.esCasa);
        return { 
          ...prev, 
          hora: value,
          citaciones: prev.citaciones.map((c, i) => i === 0 ? { ...c, hora: newCitacionTime } : c)
        };
      });
    } else {
      setFormData(prev => ({ ...prev, [name]: val }));
    }
  };

  const updateCitacion = (id: string, field: keyof Citacion, value: string) => {
    setFormData(prev => ({
      ...prev,
      citaciones: prev.citaciones.map(c => c.id === id ? { ...c, [field]: value } : c)
    }));
  };

  const addCitacion = () => {
    setFormData(prev => ({
      ...prev,
      citaciones: [...prev.citaciones, { id: Date.now().toString(), hora: '', lugar: LUGARES_CITACION[0], lugarPersonalizado: '' }]
    }));
  };

  const removeCitacion = (id: string) => {
    if (formData.citaciones.length > 1) {
      setFormData(prev => ({
        ...prev,
        citaciones: prev.citaciones.filter(c => c.id !== id)
      }));
    }
  };

  const addRival = () => {
    const newRival: Rival = { id: Date.now().toString(), nombre: 'Nuevo Rival', campo: 'Campo del rival' };
    setRivales([...rivales, newRival]);
  };

  const updateRival = (id: string, field: keyof Rival, value: string) => {
    setRivales(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeRival = (id: string) => {
    setRivales(prev => prev.filter(r => r.id !== id));
  };

  const addPartidoTorneo = () => {
    setFormData(prev => ({
      ...prev,
      partidosTorneo: [...prev.partidosTorneo, { id: Date.now().toString(), rival: '', hora: '' }]
    }));
  };

  const updatePartidoTorneo = (id: string, field: keyof PartidoTorneo, value: string) => {
    setFormData(prev => ({
      ...prev,
      partidosTorneo: prev.partidosTorneo.map(p => p.id === id ? { ...p, [field]: value } : p)
    }));
  };

  const removePartidoTorneo = (id: string) => {
    if (formData.partidosTorneo.length > 1) {
      setFormData(prev => ({
        ...prev,
        partidosTorneo: prev.partidosTorneo.filter(p => p.id !== id)
      }));
    }
  };

  const clearForm = () => {
    if (window.confirm('¿Estás seguro de que quieres limpiar el formulario?')) {
      localStorage.removeItem('convocatoria_v2_data');
      setFormData({ 
        ...INITIAL_STATE, 
        citaciones: [{ id: '1', hora: '', lugar: LUGARES_CITACION[0], lugarPersonalizado: '' }],
        partidosTorneo: [{ id: '1', rival: '', hora: '' }]
      });
    }
  };

  const getRival = () => rivales.find(r => r.id === formData.rivalId) || rivales[0];

  const generateMessage = () => {
    const rival = getRival();
    let local = "";
    let visitante = "";
    let campo = "";

    if (formData.tipoPartido === 'liga') {
      local = formData.esCasa ? formData.equipoPropio : rival.nombre;
      visitante = formData.esCasa ? rival.nombre : formData.equipoPropio;
      campo = formData.esCasa ? formData.campoPropio : formData.campoRivalEditado;
    } else if (formData.tipoPartido === 'amistoso') {
      local = formData.esCasa ? formData.equipoPropio : formData.rivalManual;
      visitante = formData.esCasa ? formData.rivalManual : formData.equipoPropio;
      campo = formData.esCasa ? formData.campoPropio : formData.campoManual;
    } else {
      // Torneo
      local = "TORNEO";
      visitante = formData.rivalManual; // Nombre del torneo
      campo = formData.campoManual;
    }

    // Formatear fecha a DD/MM/AAAA
    let fechaFormateada = '...';
    if (formData.fecha) {
      const [year, month, day] = formData.fecha.split('-');
      fechaFormateada = `${day}/${month}/${year}`;
    }

    let msg = "";
    if (formData.tipoPartido === 'torneo') {
      msg = `*🏆 Torneo: ${formData.rivalManual || '...' }*\n`;
      msg += `📅 *Fecha:* ${fechaFormateada}\n`;
      msg += `📍 *Lugar:* ${campo || '...'}\n\n`;
      msg += `*Partidos:*\n`;
      (formData.partidosTorneo || []).forEach(p => {
        msg += `⚽ ${p.hora || '...'}h vs ${p.rival || '...'}\n`;
      });
      msg += `\n`;
    } else {
      msg = `*Partido: ${local} vs ${visitante}*\n`;
      msg += `📆 *Fecha:* ${fechaFormateada}\n`;
      msg += `⏰ *Hora:* ${formData.hora || '...'}\n`;
      msg += `📍 *Campo:* ${campo || '...'}\n\n`;
    }
    
    formData.citaciones.forEach((cit, index) => {
      const lugar = cit.lugar === "Otro" ? cit.lugarPersonalizado : cit.lugar;
      msg += `📍 *Citación ${index + 1}:* ${cit.hora || '...'} en ${lugar || '...'}\n`;
    });
    msg += `\n`;
    
    msg += `Todos los niños deben venir con ropa de bonito y deportivas.\n`;
    msg += `Se ruega máxima puntualidad.\n`;
    msg += `Si alguien no puede venir, que avise por privado.\n\n`;
    
    if (formData.observaciones) {
      msg += `📝 *Observaciones:* ${formData.observaciones}\n\n`;
    }
    
    if (formData.addCierre) msg += `¡Vamos equipo! `;
    if (formData.addCorazon) msg += `💙`;
    
    return msg;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateMessage());
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const openWhatsApp = () => {
    const message = generateMessage();
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 px-4 py-4 shadow-sm">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Trophy className="text-white w-5 h-5" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">Convocatorias</h1>
          </div>
          <div className="flex gap-1">
            <button 
              onClick={() => setIsEditingRivales(true)}
              className="text-slate-400 hover:text-blue-600 transition-colors p-2"
              title="Editar Rivales"
            >
              <Settings2 size={20} />
            </button>
            <button 
              onClick={clearForm}
              className="text-slate-400 hover:text-red-500 transition-colors p-2"
              title="Limpiar formulario"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 mt-6 space-y-8">
        {/* Mode Toggle */}
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <button 
            onClick={() => setFormData(prev => ({ ...prev, tipoPartido: 'liga' }))}
            className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all ${formData.tipoPartido === 'liga' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            Liga
          </button>
          <button 
            onClick={() => setFormData(prev => ({ ...prev, tipoPartido: 'amistoso' }))}
            className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all ${formData.tipoPartido === 'amistoso' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            Amistoso
          </button>
          <button 
            onClick={() => setFormData(prev => ({ ...prev, tipoPartido: 'torneo' }))}
            className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all ${formData.tipoPartido === 'torneo' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            Torneo
          </button>
        </div>

        {/* Home/Away Toggle */}
        {formData.tipoPartido !== 'torneo' && (
          <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
            <button 
              onClick={() => setFormData(prev => ({ ...prev, esCasa: true }))}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${formData.esCasa ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <Home size={18} /> En Casa
            </button>
            <button 
              onClick={() => setFormData(prev => ({ ...prev, esCasa: false }))}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${!formData.esCasa ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <Plane size={18} /> Fuera
            </button>
          </div>
        )}

        {/* Form Section */}
        <section className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Info size={14} /> Información del Partido
            </h2>
            
            <div className="space-y-4">
              {formData.tipoPartido === 'liga' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1 ml-1">Rival</label>
                  <div className="relative">
                    <select 
                      name="rivalId"
                      value={formData.rivalId}
                      onChange={handleChange}
                      className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 transition-all outline-none appearance-none"
                    >
                      <option value="" disabled>Seleccione Rival...</option>
                      {rivales.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1 ml-1">
                    {formData.tipoPartido === 'torneo' ? 'Nombre del Torneo' : 'Rival'}
                  </label>
                  <input 
                    type="text"
                    name="rivalManual"
                    value={formData.rivalManual}
                    onChange={handleChange}
                    placeholder={formData.tipoPartido === 'torneo' ? 'Ej: Torneo de Pascua' : 'Escribe el rival...'}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1 ml-1 flex items-center gap-1">
                    <Calendar size={12} /> Fecha
                  </label>
                  <input 
                    type="date"
                    name="fecha"
                    value={formData.fecha}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                  />
                </div>
                {formData.tipoPartido !== 'torneo' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1 ml-1 flex items-center gap-1">
                      <Clock size={12} /> Hora
                    </label>
                    <input 
                      type="time"
                      name="hora"
                      value={formData.hora}
                      onChange={handleChange}
                      className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 ml-1 flex items-center gap-1">
                  <MapPin size={12} /> {formData.tipoPartido === 'torneo' ? 'Lugar' : 'Campo'}
                </label>
                {formData.tipoPartido === 'liga' ? (
                  formData.esCasa ? (
                    <div className="relative">
                      <select 
                        name="campoPropio"
                        value={formData.campoPropio}
                        onChange={handleChange}
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 transition-all outline-none appearance-none"
                      >
                        <option value="" disabled>Seleccione Campo...</option>
                        {CAMPOS_CASA.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                    </div>
                  ) : (
                    <input 
                      type="text"
                      name="campoRivalEditado"
                      value={formData.campoRivalEditado}
                      onChange={handleChange}
                      placeholder="Campo del rival..."
                      className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                    />
                  )
                ) : (
                  <input 
                    type="text"
                    name="campoManual"
                    value={formData.campoManual}
                    onChange={handleChange}
                    placeholder="Escribe el campo/lugar..."
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                  />
                )}
              </div>
            </div>
          </div>

          {formData.tipoPartido === 'torneo' && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Trophy size={14} /> Partidos del Torneo
                </h2>
                <button 
                  onClick={addPartidoTorneo}
                  className="text-blue-600 flex items-center gap-1 text-xs font-bold"
                >
                  <Plus size={14} /> Añadir
                </button>
              </div>
              
              <div className="space-y-4">
                {(formData.partidosTorneo || []).map((p, index) => (
                  <div key={p.id} className="p-4 bg-slate-50 rounded-xl space-y-3 relative">
                    {(formData.partidosTorneo || []).length > 1 && (
                      <button 
                        onClick={() => removePartidoTorneo(p.id)}
                        className="absolute -top-2 -right-2 bg-white border border-slate-200 text-red-500 p-1 rounded-full shadow-sm"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-1">
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">Hora</label>
                        <input 
                          type="time"
                          value={p.hora}
                          onChange={(e) => updatePartidoTorneo(p.id, 'hora', e.target.value)}
                          className="w-full bg-white border-none rounded-lg px-2 py-2 focus:ring-2 focus:ring-blue-500 transition-all outline-none text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">Rival</label>
                        <input 
                          type="text"
                          value={p.rival}
                          onChange={(e) => updatePartidoTorneo(p.id, 'rival', e.target.value)}
                          placeholder="Nombre del rival..."
                          className="w-full bg-white border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 transition-all outline-none text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Clock size={14} /> Citaciones
              </h2>
              <button 
                onClick={addCitacion}
                className="text-blue-600 flex items-center gap-1 text-xs font-bold"
              >
                <Plus size={14} /> Añadir
              </button>
            </div>
            
            <div className="space-y-4">
              {formData.citaciones.map((cit, index) => (
                <div key={cit.id} className="p-4 bg-slate-50 rounded-xl space-y-3 relative">
                  {formData.citaciones.length > 1 && (
                    <button 
                      onClick={() => removeCitacion(cit.id)}
                      className="absolute -top-2 -right-2 bg-white border border-slate-200 text-red-500 p-1 rounded-full shadow-sm"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 mb-1">Hora C{index + 1}</label>
                      <input 
                        type="time"
                        value={cit.hora}
                        onChange={(e) => updateCitacion(cit.id, 'hora', e.target.value)}
                        className="w-full bg-white border-none rounded-lg px-2 py-2 focus:ring-2 focus:ring-blue-500 transition-all outline-none text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 mb-1">Lugar C{index + 1}</label>
                      <div className="relative">
                        <select 
                          value={cit.lugar}
                          onChange={(e) => updateCitacion(cit.id, 'lugar', e.target.value)}
                          className="w-full bg-white border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 transition-all outline-none appearance-none text-sm"
                        >
                          <option value="" disabled>Seleccione...</option>
                          {LUGARES_CITACION.map(l => <option key={l} value={l}>{l}</option>)}
                          <option value="Otro">Otro (Escribir...)</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                      </div>
                    </div>
                  </div>
                  {cit.lugar === "Otro" && (
                    <input 
                      type="text"
                      value={cit.lugarPersonalizado}
                      onChange={(e) => updateCitacion(cit.id, 'lugarPersonalizado', e.target.value)}
                      placeholder="Escribe el lugar de citación..."
                      className="w-full bg-white border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 transition-all outline-none text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Info size={14} /> Extras
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 ml-1">Observaciones</label>
                <textarea 
                  name="observaciones"
                  value={formData.observaciones}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Ej: Llevar la segunda equipación..."
                  className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 transition-all outline-none resize-none"
                />
              </div>

              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox"
                      name="addCierre"
                      checked={formData.addCierre}
                      onChange={handleChange}
                      className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 transition-colors"></div>
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                  </div>
                  <span className="text-sm text-slate-600 font-medium">Añadir "¡Vamos equipo!"</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox"
                      name="addCorazon"
                      checked={formData.addCorazon}
                      onChange={handleChange}
                      className="peer sr-only"
                    />
                    <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 transition-colors"></div>
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                  </div>
                  <span className="text-sm text-slate-600 font-medium">Añadir corazón azul 💙</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Preview Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-800">Vista Previa</h2>
            <button 
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-full transition-colors"
            >
              <AnimatePresence mode="wait">
                {copySuccess ? (
                  <motion.span 
                    key="success"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    className="flex items-center gap-1"
                  >
                    <CheckCircle2 size={14} /> Copiado
                  </motion.span>
                ) : (
                  <motion.span 
                    key="copy"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    className="flex items-center gap-1"
                  >
                    <Copy size={14} /> Copiar mensaje
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>

          <div className="bg-[#E9EDEF] rounded-2xl p-4 shadow-inner relative overflow-hidden">
            <div className="bg-white rounded-lg rounded-tl-none p-3 text-sm shadow-sm max-w-[90%] relative">
              <div className="absolute -left-2 top-0 w-0 h-0 border-t-[10px] border-t-white border-l-[10px] border-l-transparent"></div>
              <pre className="whitespace-pre-wrap font-sans text-slate-800 leading-relaxed">
                {generateMessage()}
              </pre>
              <div className="text-[10px] text-slate-400 text-right mt-1">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          <button 
            onClick={openWhatsApp}
            className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-4 rounded-2xl shadow-lg shadow-green-100 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
          >
            <Send size={20} />
            Abrir en WhatsApp
          </button>
        </section>
      </main>

      {/* Rivals Editor Modal */}
      <AnimatePresence>
        {isEditingRivales && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-md h-[85vh] sm:h-auto sm:max-h-[80vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <h3 className="font-bold text-lg">Editar Rivales</h3>
                <button 
                  onClick={() => setIsEditingRivales(false)}
                  className="bg-slate-100 p-2 rounded-full text-slate-500"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {rivales.map(r => (
                  <div key={r.id} className="p-4 bg-slate-50 rounded-2xl space-y-3 relative group">
                    <button 
                      onClick={() => removeRival(r.id)}
                      className="absolute -top-2 -right-2 bg-white border border-slate-200 text-red-500 p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Nombre del Equipo</label>
                      <input 
                        type="text"
                        value={r.nombre}
                        onChange={(e) => updateRival(r.id, 'nombre', e.target.value)}
                        className="w-full bg-white border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 transition-all outline-none text-sm font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Campo Habitual</label>
                      <input 
                        type="text"
                        value={r.campo}
                        onChange={(e) => updateRival(r.id, 'campo', e.target.value)}
                        className="w-full bg-white border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 transition-all outline-none text-sm"
                      />
                    </div>
                  </div>
                ))}
                
                <button 
                  onClick={addRival}
                  className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold flex items-center justify-center gap-2 hover:border-blue-300 hover:text-blue-500 transition-all"
                >
                  <Plus size={20} /> Añadir Nuevo Rival
                </button>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => setIsEditingRivales(false)}
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-100"
                >
                  Guardar y Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="max-w-md mx-auto px-4 mt-8 text-center">
        <p className="text-xs text-slate-400 font-medium">
          U.D. OLIVA - Gestión de Convocatorias ⚽️
        </p>
      </footer>
    </div>
  );
}
