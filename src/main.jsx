import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, Check, ChevronLeft, Clock3, LayoutDashboard, LogIn, Menu, Search, ShieldCheck, Ticket, UserRound, X } from 'lucide-react'
import './styles.css'
import './seat-states.css'

const api = async (url, options = {}) => {
  const response = await fetch(url, { cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Something went wrong')
  return data
}

const seatNames = () => Array.from({ length: 48 }, (_, index) => `${String.fromCharCode(65 + Math.floor(index / 8))}${(index % 8) + 1}`)
const getClientKey = () => {
  const existing = localStorage.getItem('reelreserve-client')
  if (existing && existing !== 'undefined' && existing !== 'null') return existing
  const key = crypto.randomUUID()
  localStorage.setItem('reelreserve-client', key)
  return key
}
const clientKey = getClientKey()

function App() {
  const [view, setView] = useState('home')
  const [shows, setShows] = useState([])
  const [selectedShow, setSelectedShow] = useState(null)
  const [occupied, setOccupied] = useState({})
  const [selectedSeats, setSelectedSeats] = useState([])
  const [booking, setBooking] = useState(null)
  const [bookingInProgress, setBookingInProgress] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const [loginOpen, setLoginOpen] = useState(false)

  useEffect(() => { api('/api/shows').then(setShows).catch(setError) }, [])
  const loadSeats = async show => {
    const data = await api(`/api/shows/${show.id}/seats`)
    setOccupied(data.occupied)
    return data
  }
  const openShow = async show => {
    setError(''); setSelectedShow(show); setSelectedSeats([])
    try { await loadSeats(show); setView('seats') } catch (problem) { setError(problem.message) }
  }
  const toggleSeat = seat => {
    if (occupied[seat] || booking) return
    setSelectedSeats(current => current.includes(seat) ? current.filter(item => item !== seat) : [...current, seat])
  }
  const confirmBooking = async () => {
    if (!selectedSeats.length || bookingInProgress) return
    setBookingInProgress(true)
    setError('')
    try {
      const holdPayload = { showId: selectedShow?.id, seats: [...selectedSeats], clientKey }
      if (!holdPayload.showId || !holdPayload.seats.length || !holdPayload.clientKey) throw new Error('Please select a movie and at least one seat.')
      const hold = await api('/api/holds', { method: 'POST', body: JSON.stringify(holdPayload) })
      if (!hold?.holdId) throw new Error('The seat hold could not be created. Please refresh and try again.')
      const bookingPayload = { ...holdPayload, holdId: hold.holdId }
      const result = await api('/api/bookings', { method: 'POST', headers: { 'Idempotency-Key': hold.holdId }, body: JSON.stringify(bookingPayload) })
      setBooking(result)
    } catch (problem) {
      setError(problem.message)
      if (problem.message.includes('seat') || problem.message.includes('hold')) {
        try { await loadSeats(selectedShow) } catch {}
      }
    } finally { setBookingInProgress(false) }
  }
  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setView('home')}><span className="brand-mark">R</span><span>reel<span>reserve</span></span></button><nav><button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>Now showing</button><button onClick={() => setView('admin')}><LayoutDashboard size={15} /> Admin</button></nav><div className="top-actions"><button className="icon-button mobile-menu"><Menu size={18} /></button>{user ? <button className="profile"><UserRound size={16} /> {user.name}</button> : <button className="login-button" onClick={() => setLoginOpen(true)}><LogIn size={15} /> Sign in</button>}</div></header>
    {view === 'home' && <Home shows={shows} onSelect={openShow} />}
    {view === 'seats' && <SeatPicker show={selectedShow} occupied={occupied} selectedSeats={selectedSeats} toggleSeat={toggleSeat} onBack={() => setView('home')} onConfirm={confirmBooking} bookingInProgress={bookingInProgress} error={error} />}
    {view === 'success' && <BookingSuccess booking={booking} show={selectedShow} onHome={() => setView('home')} />}
    {booking && view === 'seats' && <BookingConfirmationModal booking={booking} show={selectedShow} onClose={() => { setBooking(null); setSelectedSeats([]); setView('home') }} />}
    {view === 'admin' && <Admin user={user} onLogin={result => setUser(result.user)} />}
    {error && view === 'home' && <div className="toast"><X size={16} /> {error}</div>}
    {loginOpen && <Login onClose={() => setLoginOpen(false)} onLogin={result => { localStorage.setItem('reelreserve-token', result.token); setUser(result.user); setLoginOpen(false) }} />}
  </div>
}

function Home({ shows, onSelect }) {
  const movies = Object.values(shows.reduce((groups, show) => {
    if (!groups[show.title]) groups[show.title] = []
    groups[show.title].push(show)
    return groups
  }, {}))
  return <main><section className="hero"><div className="hero-copy"><p className="eyebrow">CURATED FOR THE BIG SCREEN</p><h1>Your night out,<br /><em>perfectly</em> planned.</h1><p className="hero-sub">Reserve the best seats in the house for the stories worth leaving home for.</p><button className="primary-button" onClick={() => document.getElementById('showtimes').scrollIntoView({ behavior: 'smooth' })}>Explore showtimes <ArrowRight size={17} /></button></div><div className="hero-art"><div className="ticket-shape"><Ticket size={24} /><span>Tonight's<br /><strong>escape</strong></span><small>RR / 24</small></div><div className="hero-film"></div></div></section><section id="showtimes" className="showtimes"><div className="section-heading"><div><p className="eyebrow">THE LINEUP</p><h2>Now showing</h2></div><button className="browse-link">All showtimes <ArrowRight size={16} /></button></div><div className="date-strip"><button className="date active"><strong>24</strong><span>Today</span></button><button className="date"><strong>25</strong><span>Fri</span></button><button className="date"><strong>26</strong><span>Sat</span></button><button className="date"><strong>27</strong><span>Sun</span></button></div><div className="movie-grid">{movies.map((movie, index) => <MovieCard key={movie[0].id} shows={movie} index={index} onSelect={onSelect} />)}</div></section><footer><div className="brand footer-brand"><span className="brand-mark">R</span><span>reelreserve</span></div><p>Thoughtful bookings for memorable nights.</p><span>© 2024 ReelReserve</span></footer></main>
}

function MovieCard({ shows, index, onSelect }) {
  const movie = shows[0]
  return <article className="movie-card" style={{ '--accent': movie.accent, animationDelay: `${index * 100}ms` }}><div className="poster"><img src={movie.poster} alt="" /><span className="rating">{movie.rating}</span><span className="poster-number">0{index + 1}</span></div><div className="movie-info"><div><h3>{movie.title}</h3><p>{movie.genre} · {movie.duration}</p></div><span className="price">${movie.price.toFixed(2)}</span></div><div className="showtimes-label"><Clock3 size={14} /> {shows.length} showtimes today</div><div className="showtime-list">{shows.map(show => <button className="showtime-chip" key={show.id} onClick={() => onSelect(show)}><strong>{show.time}</strong><small>{show.theatre}</small><ArrowRight size={13} /></button>)}</div></article>
}

function HomeLegacy({ shows, onSelect }) {
  return <main><section className="hero"><div className="hero-copy"><p className="eyebrow">CURATED FOR THE BIG SCREEN</p><h1>Your night out,<br /><em>perfectly</em> planned.</h1><p className="hero-sub">Reserve the best seats in the house for the stories worth leaving home for.</p><button className="primary-button" onClick={() => document.getElementById('showtimes').scrollIntoView({ behavior: 'smooth' })}>Explore showtimes <ArrowRight size={17} /></button></div><div className="hero-art"><div className="ticket-shape"><Ticket size={24} /><span>Tonight's<br /><strong>escape</strong></span><small>RR / 24</small></div><div className="hero-film"></div></div></section><section id="showtimes" className="showtimes"><div className="section-heading"><div><p className="eyebrow">THE LINEUP</p><h2>Now showing</h2></div><button className="browse-link">All showtimes <ArrowRight size={16} /></button></div><div className="date-strip"><button className="date active"><strong>24</strong><span>Today</span></button><button className="date"><strong>25</strong><span>Fri</span></button><button className="date"><strong>26</strong><span>Sat</span></button><button className="date"><strong>27</strong><span>Sun</span></button></div><div className="movie-grid">{shows.map((show, index) => <MovieCard key={show.id} show={show} index={index} onSelect={onSelect} />)}</div></section><footer><div className="brand footer-brand"><span className="brand-mark">R</span><span>reelreserve</span></div><p>Thoughtful bookings for memorable nights.</p><span>© 2024 ReelReserve</span></footer></main>
}

function MovieCardLegacy({ show, index, onSelect }) {
  return <article className="movie-card" style={{ '--accent': show.accent, animationDelay: `${index * 100}ms` }}><div className="poster"><img src={show.poster} alt="" /><span className="rating">{show.rating}</span><span className="poster-number">0{index + 1}</span></div><div className="movie-info"><div><h3>{show.title}</h3><p>{show.genre} · {show.duration}</p></div><span className="price">${show.price.toFixed(2)}</span></div><div className="show-row"><span><Clock3 size={14} /> {show.time}</span><span>{show.theatre}</span><button className="round-arrow" onClick={() => onSelect(show)}><ArrowRight size={16} /></button></div></article>
}

function SeatPicker({ show, occupied, selectedSeats, toggleSeat, onBack, onConfirm, bookingInProgress, error }) {
  const [filter, setFilter] = useState('all')
  const allSeats = seatNames()
  const isVisible = seat => {
    if (filter === 'available') return !occupied[seat] && !selectedSeats.includes(seat)
    if (filter === 'selected') return selectedSeats.includes(seat)
    if (filter === 'occupied') return Boolean(occupied[seat])
    return true
  }
  const filters = [
    ['all', 'All seats', 'all-dot'],
    ['available', 'Available', 'available'],
    ['selected', 'Selected', 'selected-dot'],
    ['occupied', 'Occupied', 'taken-dot']
  ]
  return <main className="booking-page">
    <button className="back-link" onClick={onBack}><ChevronLeft size={17} /> Back to movies</button>
    <div className="booking-head"><div><p className="eyebrow">SELECT YOUR SEATS</p><h1>{show.title}</h1><p>{show.date} · {show.time} · {show.theatre}</p></div><div className="hold-note"><ShieldCheck size={18} /><span>Seats held for <strong>8 minutes</strong></span></div></div>
    <div className="booking-layout"><section className="seat-map-panel"><div className="screen"><span>SCREEN</span></div><div className="seat-map">{['A','B','C','D','E','F'].map(row => <div className="seat-row" key={row}><span className="row-label">{row}</span>{allSeats.filter(seat => seat.startsWith(row)).map(seat => <button key={seat} aria-label={`Seat ${seat}`} className={`seat ${occupied[seat] ? 'taken' : ''} ${selectedSeats.includes(seat) ? 'selected' : ''} ${!isVisible(seat) ? 'dimmed' : ''}`} onClick={() => toggleSeat(seat)}>{seat.slice(1)}</button>)}</div>)}</div><div className="legend">{filters.map(([value, label, dot]) => <button key={value} className={`legend-filter ${filter === value ? 'active' : ''}`} onClick={() => setFilter(value)}><i className={dot}></i>{label}</button>)}</div><p className="seat-help">Available seats can be selected. Occupied seats cannot be booked.</p></section><aside className="summary-panel"><p className="eyebrow">YOUR RESERVATION</p><h2>{selectedSeats.length ? `${selectedSeats.length} ${selectedSeats.length === 1 ? 'seat' : 'seats'}` : 'Choose your seats'}</h2><div className="chosen-seats">{selectedSeats.length ? selectedSeats.map(seat => <span key={seat}>{seat}</span>) : <p>Pick a seat from the map to continue.</p>}</div><div className="summary-line"><span>Tickets</span><strong>${(selectedSeats.length * show.price).toFixed(2)}</strong></div><div className="summary-line muted"><span>Booking fee</span><span>Included</span></div><button className="primary-button full" disabled={!selectedSeats.length || bookingInProgress} onClick={onConfirm}>{bookingInProgress ? 'Confirming...' : 'Reserve seats'} {!bookingInProgress && <ArrowRight size={17} />}</button>{error && <p className="inline-error">{error}</p>}<p className="secure-note"><ShieldCheck size={14} /> No payment gateway connected. Demo confirmation is instant.</p></aside></div>
  </main>
}

function SeatPickerLegacy({ show, occupied, selectedSeats, toggleSeat, onBack, onConfirm, bookingInProgress, error }) {
  const allSeats = seatNames()
  return <main className="booking-page"><button className="back-link" onClick={onBack}><ChevronLeft size={17} /> Back to movies</button><div className="booking-head"><div><p className="eyebrow">SELECT YOUR SEATS</p><h1>{show.title}</h1><p>{show.date} · {show.time} · {show.theatre}</p></div><div className="hold-note"><ShieldCheck size={18} /><span>Seats held for <strong>8 minutes</strong></span></div></div><div className="booking-layout"><section className="seat-map-panel"><div className="screen"><span>SCREEN</span></div><div className="seat-map">{['A','B','C','D','E','F'].map(row => <div className="seat-row" key={row}><span className="row-label">{row}</span>{allSeats.filter(seat => seat.startsWith(row)).map(seat => <button key={seat} aria-label={`Seat ${seat}`} className={`seat ${occupied[seat] ? 'taken' : ''} ${selectedSeats.includes(seat) ? 'selected' : ''}`} onClick={() => toggleSeat(seat)}>{seat.slice(1)}</button>)}</div>)}</div><div className="legend"><span><i className="available"></i> Available</span><span><i className="selected-dot"></i> Selected</span><span><i className="taken-dot"></i> Occupied</span></div></section><aside className="summary-panel"><p className="eyebrow">YOUR RESERVATION</p><h2>{selectedSeats.length ? `${selectedSeats.length} ${selectedSeats.length === 1 ? 'seat' : 'seats'}` : 'Choose your seats'}</h2><div className="chosen-seats">{selectedSeats.length ? selectedSeats.map(seat => <span key={seat}>{seat}</span>) : <p>Pick a seat from the map to continue.</p>}</div><div className="summary-line"><span>Tickets</span><strong>${(selectedSeats.length * show.price).toFixed(2)}</strong></div><div className="summary-line muted"><span>Booking fee</span><span>Included</span></div><button className="primary-button full" disabled={!selectedSeats.length || bookingInProgress} onClick={onConfirm}>{bookingInProgress ? 'Confirming...' : 'Reserve seats'} {!bookingInProgress && <ArrowRight size={17} />}</button>{error && <p className="inline-error">{error}</p>}<p className="secure-note"><ShieldCheck size={14} /> No payment gateway connected. Demo confirmation is instant.</p></aside></div></main>
}

function BookingSuccess({ booking, show, onHome }) { return <main className="success-page"><div className="success-card"><div className="success-icon"><Check size={27} /></div><p className="eyebrow">YOUR SEAT IS BOOKED</p><h1>You're going to<br /><em>{show.title}</em></h1><p className="success-copy">Your seat is booked and secured. Show this reference at the counter when you arrive.</p><div className="confirmation"><span>REFERENCE</span><strong>{booking.id}</strong><div><span>{show.date} · {show.time}</span><span>{booking.seats.join(' · ')} · {show.theatre}</span></div></div><button className="primary-button" onClick={onHome}>Browse more films <ArrowRight size={17} /></button></div></main> }

function BookingConfirmationModal({ booking, show, onClose }) {
  return <div className="booking-modal-backdrop" role="dialog" aria-modal="true" aria-label="Booking confirmed">
    <div className="booking-modal">
      <button className="close-modal" onClick={onClose} aria-label="Close confirmation"><X size={18} /></button>
      <div className="success-icon"><Check size={27} /></div>
      <p className="eyebrow">BOOKING CONFIRMED</p>
      <h2>Your seat is booked</h2>
      <p className="modal-copy">Your reservation for <strong>{show.title}</strong> is confirmed.</p>
      <div className="modal-details"><span>{show.date} · {show.time}</span><strong>{booking.seats.join(' · ')}</strong><span>{show.theatre}</span></div>
      <div className="modal-reference"><span>REFERENCE</span><strong>{booking.id}</strong></div>
      <button className="primary-button full" onClick={onClose}>Done <Check size={16} /></button>
    </div>
  </div>
}

function Admin({ user, onLogin }) {
  const [data, setData] = useState(null)
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { if (user?.role === 'ADMIN') api('/api/admin/summary').then(setData) }, [user])
  if (user?.role !== 'ADMIN') return <AdminSignIn onLogin={onLogin} />
  const addShow = async event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const show = await api('/api/shows', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('reelreserve-token') || ''}` }, body: JSON.stringify(Object.fromEntries(form)) })
      setMessage(`${show.title} was added to the lineup.`); setAdding(false); event.currentTarget.reset()
      api('/api/admin/summary').then(setData)
    } catch (problem) { setMessage(problem.message) }
  }
  return <main className="admin-page"><div className="admin-heading"><div><p className="eyebrow">OPERATIONS / OVERVIEW</p><h1>Good evening, Admin.</h1><p>Manage tonight's screenings and keep the house moving.</p></div><button className="primary-button" onClick={() => { setAdding(!adding); setMessage('') }}><Ticket size={16} /> {adding ? 'Close form' : 'Add a show'}</button></div>{message && <p className="admin-message">{message}</p>}{adding && <form className="show-form" onSubmit={addShow}><p className="eyebrow">NEW SCREENING</p><h2>Schedule a movie</h2><div className="form-grid"><input name="title" placeholder="Movie name" required /><input name="date" placeholder="Date, e.g. Fri 25 Sep" required /><input name="time" type="time" required /><input name="screen" placeholder="Screen number" required /><input name="theatre" placeholder="Theatre name" /><input name="price" type="number" min="1" step="0.50" placeholder="Ticket price" required /><input name="genre" placeholder="Genre" /><input name="duration" placeholder="Duration" /></div><button className="primary-button" type="submit">Publish show <ArrowRight size={17} /></button></form>}<div className="metrics">{[['REVENUE', `$${(data?.revenue || 0).toFixed(2)}`, 'Today'], ['BOOKINGS', data?.bookings || 0, 'Confirmed'], ['ACTIVE HOLDS', data?.holds || 0, 'Expires in 8 min'], ['SCREENINGS', data?.shows || 0, 'Live today']].map(metric => <div className="metric" key={metric[0]}><span>{metric[0]}</span><strong>{metric[1]}</strong><small>{metric[2]}</small></div>)}</div><section className="admin-table"><div className="table-heading"><h2>Recent bookings</h2><button className="browse-link">View all <ArrowRight size={16} /></button></div>{data?.recent?.length ? data.recent.map(item => <div className="booking-row" key={item.id}><span className="status-dot"></span><strong>{item.id}</strong><span>{item.seats.join(', ')}</span><span>Confirmed</span><b>${item.total.toFixed(2)}</b></div>) : <div className="empty-state"><Ticket size={20} /><p>Bookings will appear here as customers reserve seats.</p></div>}</section></main>
}

function AdminSignIn({ onLogin }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const submit = async event => {
    event.preventDefault(); setError('')
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email }) })
      if (result.user.role !== 'ADMIN') throw new Error('Use an admin email to enter the portal.')
      localStorage.setItem('reelreserve-token', result.token); onLogin(result)
    } catch (problem) { setError(problem.message) }
  }
  return <main className="admin-page"><form className="admin-login" onSubmit={submit}><span className="brand-mark">R</span><p className="eyebrow">STAFF ACCESS</p><h1>Admin sign in</h1><p>Enter your admin email to manage screenings and shows.</p><input type="email" placeholder="admin@reelreserve.com" value={email} onChange={event => setEmail(event.target.value)} required /><button className="primary-button full">Enter portal <ArrowRight size={17} /></button>{error && <p className="inline-error">{error}</p>}</form></main>
}

function Login({ onClose, onLogin }) { const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [register, setRegister] = useState(false); const submit = async event => { event.preventDefault(); const result = await api(register ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(register ? { name, email } : { email }) }); onLogin(result) }; return <div className="modal-backdrop" onClick={onClose}><form className="login-modal" onSubmit={submit} onClick={event => event.stopPropagation()}><button type="button" className="close-modal" onClick={onClose}><X size={18} /></button><span className="brand-mark">R</span><h2>{register ? 'Create your account' : 'Welcome back'}</h2><p>{register ? 'Save your favorite cinema nights.' : 'Sign in to manage your reservations.'}</p>{register && <input placeholder="Your name" value={name} onChange={event => setName(event.target.value)} required />}<input type="email" placeholder="Email address" value={email} onChange={event => setEmail(event.target.value)} required /><button className="primary-button full">{register ? 'Create account' : 'Continue'} <ArrowRight size={17} /></button><button type="button" className="switch-auth" onClick={() => setRegister(!register)}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</button></form></div> }

createRoot(document.getElementById('root')).render(<App />)