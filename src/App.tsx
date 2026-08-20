import { useEffect, useMemo, useState } from 'react'
import {
  ActionIcon, Badge, Box, Button, Drawer, Group, Menu, Modal, NumberInput,
  Progress, SegmentedControl, Select, Stack, Switch, Text, TextInput, Tooltip,
} from '@mantine/core'
import {
  IconActivity, IconApple, IconArrowDownRight, IconArrowUpRight, IconBell,
  IconChevronDown, IconChevronRight, IconCircleCheck, IconDashboard, IconDatabase,
  IconDeviceMobile, IconDroplet, IconHeartRateMonitor, IconLayoutSidebarLeftCollapse,
  IconLink, IconMoon, IconNotes, IconPlus, IconScale, IconSearch, IconSettings,
  IconSparkles, IconTools, IconTrendingUp, IconUser, IconX,
} from '@tabler/icons-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'

type Page = 'Today' | 'Journal' | 'Trends' | 'Connections' | 'Settings'
type Category = 'Meals' | 'Activity' | 'Sleep' | 'Measurements' | 'Check-ins'
type JournalEvent = { id: string; time: string; category: Category; title: string; detail: string; source: string }

const trend = [
  { day: 'Fri', sleep: 6.7, energy: 5 }, { day: 'Sat', sleep: 7.2, energy: 6 },
  { day: 'Sun', sleep: 7.9, energy: 8 }, { day: 'Mon', sleep: 6.4, energy: 5 },
  { day: 'Tue', sleep: 7.1, energy: 7 }, { day: 'Wed', sleep: 7.4, energy: 7 },
  { day: 'Thu', sleep: 7.63, energy: 8 },
]

const initialEvents: JournalEvent[] = [
  { id:'energy', time:'12:40', category:'Check-ins', title:'Energy check-in', detail:'8 out of 10', source:'You' },
  { id:'walk', time:'09:02', category:'Activity', title:'Morning walk', detail:'24 min · 2.1 km', source:'Health Connect' },
  { id:'breakfast', time:'08:10', category:'Meals', title:'Breakfast', detail:'Oats, yoghurt & berries · 510 kcal', source:'You' },
  { id:'sleep', time:'07:48', category:'Sleep', title:'Sleep', detail:'7h 38m · 91% efficiency', source:'Health Connect' },
]

const eventVisual = (category: Category) => category === 'Meals' ? { icon:IconApple, tone:'amber' } : category === 'Activity' ? { icon:IconActivity, tone:'green' } : category === 'Sleep' ? { icon:IconMoon, tone:'indigo' } : category === 'Measurements' ? { icon:IconScale, tone:'blue' } : { icon:IconSparkles, tone:'violet' }

const nav: { label: Page; icon: typeof IconDashboard }[] = [
  { label: 'Today', icon: IconDashboard }, { label: 'Journal', icon: IconNotes },
  { label: 'Trends', icon: IconTrendingUp }, { label: 'Connections', icon: IconLink },
]

function MetricCard({ icon: Icon, label, value, note, delta, tone }: { icon: typeof IconMoon, label: string, value: string, note: string, delta?: string, tone: string }) {
  return <article className="metric-card">
    <div className={`metric-icon ${tone}`}><Icon size={19} stroke={1.8} /></div>
    <div className="metric-top"><Text className="eyebrow">{label}</Text>{delta && <Badge variant="light" color="teal" size="sm" leftSection={<IconArrowUpRight size={11} />}>{delta}</Badge>}</div>
    <Text className="metric-value">{value}</Text>
    <Text className="metric-note">{note}</Text>
  </article>
}

function QuickAdd({ opened, close, add }: { opened: boolean, close: () => void, add: (event: JournalEvent) => void }) {
  const [kind, setKind] = useState('Meal')
  const [meal, setMeal] = useState('Lunch'); const [description, setDescription] = useState(''); const [amount, setAmount] = useState<number|string>(250); const [energy, setEnergy] = useState<string|null>('5 · Neutral'); const [note, setNote] = useState('')
  const submit = () => {
    const time = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
    let event: JournalEvent
    if (kind === 'Meal') event = { id:crypto.randomUUID(), time, category:'Meals', title:meal, detail:description || 'Meal logged', source:'You' }
    else if (kind === 'Water') event = { id:crypto.randomUUID(), time, category:'Measurements', title:'Water', detail:`${amount || 0} ml`, source:'You' }
    else if (kind === 'Weight') event = { id:crypto.randomUUID(), time, category:'Measurements', title:'Weight', detail:`${amount || 0} kg`, source:'You' }
    else event = { id:crypto.randomUUID(), time, category:'Check-ins', title:'Energy check-in', detail:`${energy?.split(' ')[0] || 5} out of 10${note ? ` · ${note}` : ''}`, source:'You' }
    add(event); setDescription(''); setNote(''); close()
  }
  return <Modal opened={opened} onClose={close} centered radius="lg" title={<div><Text fw={700} size="lg">Quick add</Text><Text size="sm" c="dimmed">Add something to today</Text></div>}>
    <Stack gap="md">
      <SegmentedControl fullWidth value={kind} onChange={setKind} data={['Meal', 'Water', 'Weight', 'Check-in']} />
      {kind === 'Meal' && <><Select label="Meal" value={meal} onChange={value=>setMeal(value || 'Meal')} data={['Breakfast', 'Lunch', 'Dinner', 'Snack']} /><TextInput label="What did you have?" value={description} onChange={e=>setDescription(e.currentTarget.value)} placeholder="Search foods or describe a meal" leftSection={<IconSearch size={16} />} /></>}
      {kind === 'Water' && <NumberInput label="Amount" value={amount} onChange={setAmount} suffix=" ml" step={50} min={0} />}
      {kind === 'Weight' && <NumberInput label="Weight" value={amount} onChange={setAmount} decimalScale={1} suffix=" kg" placeholder="72.4" min={0} />}
      {kind === 'Check-in' && <><Select label="How is your energy?" value={energy} onChange={setEnergy} data={['1 · Very low','2','3','4','5 · Neutral','6','7','8','9','10 · Excellent']} /><TextInput label="Note (optional)" value={note} onChange={e=>setNote(e.currentTarget.value)} placeholder="Anything worth remembering?" /></>}
      <Group justify="flex-end"><Button variant="subtle" color="gray" onClick={close}>Cancel</Button><Button color="teal" onClick={submit}>Add to journal</Button></Group>
    </Stack>
  </Modal>
}

function Sidebar({ page, setPage, collapsed, toggle }: { page: Page, setPage: (p: Page) => void, collapsed: boolean, toggle: () => void }) {
  return <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
    <div className="brand"><div className="brand-mark"><IconActivity size={22} /></div>{!collapsed && <><span>track</span><strong>it</strong></>}<ActionIcon className="collapse" variant="subtle" color="gray" onClick={toggle} aria-label="Collapse sidebar"><IconLayoutSidebarLeftCollapse size={18} /></ActionIcon></div>
    <nav>{nav.map(({label, icon: Icon}) => <button className={`nav-item ${page === label ? 'active' : ''}`} key={label} onClick={() => setPage(label)}><Icon size={20} stroke={1.7}/>{!collapsed && <span>{label}</span>}</button>)}</nav>
    <div className="sidebar-foot"><button className={`nav-item ${page === 'Settings' ? 'active' : ''}`} onClick={() => setPage('Settings')}><IconSettings size={20}/>{!collapsed && <span>Settings</span>}</button><div className="profile"><div className="avatar">NB</div>{!collapsed && <div><Text size="sm" fw={600}>Nick</Text><Text size="xs" c="dimmed">Local account</Text></div>}</div></div>
  </aside>
}

function Header({ page, add }: { page: Page, add: () => void }) {
  return <header className="topbar"><div><Text className="mobile-brand">track<strong>it</strong></Text><Text className="page-title">{page}</Text></div><Group gap="xs"><Tooltip label="Search"><ActionIcon variant="subtle" color="gray" size="lg"><IconSearch size={20}/></ActionIcon></Tooltip><Tooltip label="Notifications"><ActionIcon variant="subtle" color="gray" size="lg"><IconBell size={20}/></ActionIcon></Tooltip><Button color="teal" leftSection={<IconPlus size={18}/>} onClick={add}>Quick add</Button></Group></header>
}

function Today({ events, insight, dismissInsight, openJournal }: { events: JournalEvent[]; insight:boolean; dismissInsight:()=>void; openJournal:()=>void }) {
  return <div className="page-content">
    <section className="welcome"><div><Text className="date">Thursday, 20 August</Text><h1>Good afternoon, Nick.</h1><Text className="subhead">Here’s the shape of your day so far.</Text></div><button className="date-button">Today <IconChevronDown size={15}/></button></section>
    {insight && <section className="insight"><div className="insight-icon"><IconSparkles size={20}/></div><div><Text className="eyebrow teal-text">TODAY’S NOTE</Text><Text fw={650}>You slept 42 minutes longer than your recent average.</Text><Text size="sm" c="dimmed">Your resting heart rate is also 3 bpm lower this morning.</Text></div><ActionIcon aria-label="Dismiss insight" onClick={dismissInsight} variant="subtle" color="gray" className="insight-close"><IconX size={17}/></ActionIcon></section>}
    <section className="metric-grid"><MetricCard icon={IconMoon} tone="indigo" label="Sleep" value="7h 38m" note="91% efficiency" delta="42m"/><MetricCard icon={IconHeartRateMonitor} tone="rose" label="Resting heart rate" value="58 bpm" note="Your 30-day range: 56–64"/><MetricCard icon={IconSparkles} tone="violet" label="Energy" value="8 / 10" note="Checked in at 12:40"/><MetricCard icon={IconScale} tone="blue" label="Weight" value="—" note="No reading today"/></section>
    <section className="dashboard-grid">
      <article className="panel movement"><div className="panel-head"><div><Text className="eyebrow">TODAY</Text><h2>Daily rhythm</h2></div><Button variant="subtle" color="gray" size="xs" rightSection={<IconChevronRight size={14}/>}>Details</Button></div>
        <div className="progress-row"><div className="progress-label"><span><IconActivity size={18}/>Steps</span><strong>7,240 <small>of 10,000</small></strong></div><Progress value={72.4} color="teal" radius="xl" size="sm"/></div>
        <div className="progress-row"><div className="progress-label"><span><IconDroplet size={18}/>Water</span><strong>1.6 L <small>of 2.4 L</small></strong></div><Progress value={67} color="cyan" radius="xl" size="sm"/></div>
        <div className="progress-row"><div className="progress-label"><span><IconApple size={18}/>Protein</span><strong>84 g <small>of 115 g</small></strong></div><Progress value={73} color="orange" radius="xl" size="sm"/></div>
      </article>
      <article className="panel mini-chart"><div className="panel-head"><div><Text className="eyebrow">PAST 7 DAYS</Text><h2>Sleep duration</h2></div><Badge variant="light" color="teal" leftSection={<IconArrowUpRight size={12}/>}>+6%</Badge></div><ResponsiveContainer width="100%" height={155}><AreaChart data={trend} margin={{top:12,right:5,left:-30,bottom:0}}><defs><linearGradient id="sleep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#486f69" stopOpacity={.28}/><stop offset="1" stopColor="#486f69" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#ebe9e1"/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#8a8d87'}}/><YAxis domain={[5,9]} axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#8a8d87'}}/><ChartTooltip contentStyle={{borderRadius:10,border:'1px solid #e3e0d7',fontSize:12}}/><Area type="monotone" dataKey="sleep" stroke="#38645e" strokeWidth={2.5} fill="url(#sleep)"/></AreaChart></ResponsiveContainer></article>
    </section>
    <section className="panel timeline"><div className="panel-head"><div><Text className="eyebrow">JOURNAL</Text><h2>Your timeline</h2></div><Button onClick={openJournal} variant="subtle" color="teal" size="xs">View all</Button></div>{events.slice(0,5).map(event=>{const {icon:Icon,tone}=eventVisual(event.category); return <div className="event" key={event.id}><time>{event.time}</time><div className={`event-icon ${tone}`}><Icon size={17}/></div><div className="event-copy"><Text fw={600} size="sm">{event.title}</Text><Text size="sm" c="dimmed">{event.detail}</Text></div><Badge variant="light" color="gray" fw={500}>{event.source}</Badge><IconChevronRight size={17} color="#a3a49e"/></div>})}</section>
  </div>
}

function Journal() { return <div className="page-content simple-page"><div className="section-title"><div><Text className="date">YOUR RECORD</Text><h1>Journal</h1><Text className="subhead">Everything you’ve logged and synced, in one honest timeline.</Text></div><TextInput placeholder="Search your journal" leftSection={<IconSearch size={16}/>} /></div><div className="filter-row"><Button variant="filled" color="dark" radius="xl" size="xs">All</Button>{['Meals','Activity','Sleep','Measurements','Check-ins'].map(x=><Button key={x} variant="default" radius="xl" size="xs">{x}</Button>)}</div><section className="panel timeline"><div className="day-divider"><span>Today</span><small>4 entries</small></div>{events.map(({time,icon:Icon,tone,title,detail,source})=><div className="event roomy" key={time}><time>{time}</time><div className={`event-icon ${tone}`}><Icon size={17}/></div><div className="event-copy"><Text fw={600}>{title}</Text><Text size="sm" c="dimmed">{detail}</Text></div><Badge variant="light" color="gray">{source}</Badge><Menu><Menu.Target><ActionIcon variant="subtle" color="gray"><IconChevronDown size={17}/></ActionIcon></Menu.Target><Menu.Dropdown><Menu.Item>View details</Menu.Item><Menu.Item>Duplicate</Menu.Item><Menu.Item color="red">Delete</Menu.Item></Menu.Dropdown></Menu></div>)}</section></div> }

function Trends() { return <div className="page-content simple-page"><Text className="date">EXPLORE</Text><h1>Trends</h1><Text className="subhead">Look for patterns without losing sight of the underlying data.</Text><section className="question-grid">{['How has my sleep changed?','Compare sleep and energy','What follows high-activity days?'].map((x,i)=><button className="question" key={x}><div className={['indigo','violet','green'][i]}><IconTrendingUp size={20}/></div><span>{x}</span><IconChevronRight size={17}/></button>)}</section><section className="panel chart-large"><div className="panel-head"><div><Text className="eyebrow">LAST 7 DAYS</Text><h2>Sleep & energy</h2><Text size="sm" c="dimmed">Your energy tends to be higher after longer sleep.</Text></div><SegmentedControl size="xs" data={['7D','30D','90D']} defaultValue="7D"/></div><ResponsiveContainer width="100%" height={310}><AreaChart data={trend} margin={{top:25,right:15,left:-10,bottom:0}}><CartesianGrid vertical={false} stroke="#ebe9e1"/><XAxis dataKey="day" axisLine={false} tickLine={false}/><YAxis domain={[0,10]} axisLine={false} tickLine={false}/><ChartTooltip/><Area type="monotone" dataKey="sleep" stroke="#4f61a8" fill="#4f61a81a" strokeWidth={3}/><Area type="monotone" dataKey="energy" stroke="#7c519c" fill="#7c519c0f" strokeWidth={3}/></AreaChart></ResponsiveContainer><div className="chart-note"><IconCircleCheck size={18}/><Text size="sm"><strong>7 matched days.</strong> This is an observation, not proof that one caused the other.</Text></div></section></div> }

function Connections() { const cards=[{icon:IconDeviceMobile,title:'Health Connect',status:'Needs companion app',desc:'Sync sleep, activity, heart rate and body measurements securely from Android.',color:'green'},{icon:IconTools,title:'MCP server',status:'Disabled',desc:'Let compatible assistants query selected health data through scoped, auditable access.',color:'violet'},{icon:IconDatabase,title:'Import & export',status:'Ready',desc:'Bring in historical data or download a portable copy of everything you own.',color:'blue'}]; return <div className="page-content simple-page"><Text className="date">YOUR DATA</Text><h1>Connections</h1><Text className="subhead">You decide what comes in, what goes out, and who can see it.</Text><div className="connection-grid">{cards.map(({icon:Icon,title,status,desc,color},i)=><article className="connection-card" key={title}><div className={`connection-icon ${color}`}><Icon size={24}/></div><div className="connection-title"><h2>{title}</h2><Badge variant="light" color={i===2?'teal':'gray'}>{status}</Badge></div><Text c="dimmed" size="sm">{desc}</Text><div className="connection-action"><Button variant={i===0?'filled':'default'} color="teal">{i===0?'Set up':'Manage'}</Button><IconChevronRight size={18}/></div></article>)}</div><section className="privacy-note"><IconCircleCheck size={22}/><div><Text fw={650}>Private by default</Text><Text size="sm" c="dimmed">TrackIt has no telemetry and sends nothing to third parties unless you explicitly connect it.</Text></div></section></div> }

function Settings() { return <div className="page-content simple-page"><Text className="date">PREFERENCES</Text><h1>Settings</h1><Text className="subhead">Make TrackIt feel like yours.</Text><section className="panel settings-list">{[['Profile & units','Timezone, locale and measurement units',IconUser],['Goals','Optional daily targets and ranges',IconTrendingUp],['Privacy & retention','Data categories, retention and deletion',IconDatabase],['System','Backups, updates and diagnostics',IconSettings]].map(([title,desc,Icon])=><button key={title as string}><div className="settings-icon"><Icon size={19}/></div><div><Text fw={600}>{title as string}</Text><Text size="sm" c="dimmed">{desc as string}</Text></div><IconChevronRight size={18}/></button>)}</section></div> }

export default function App() {
  const [page, setPage] = useState<Page>('Today'); const [quick, setQuick] = useState(false); const [collapsed, setCollapsed] = useState(false); const [mobileNav, setMobileNav] = useState(false)
  const screen = page === 'Today' ? <Today/> : page === 'Journal' ? <Journal/> : page === 'Trends' ? <Trends/> : page === 'Connections' ? <Connections/> : <Settings/>
  return <><Box className="app-shell"><Sidebar page={page} setPage={setPage} collapsed={collapsed} toggle={()=>setCollapsed(!collapsed)}/><main className="main"><Header page={page} add={()=>setQuick(true)}/>{screen}</main></Box><nav className="mobile-nav">{nav.slice(0,4).map(({label,icon:Icon})=><button className={page===label?'active':''} onClick={()=>setPage(label)} key={label}><Icon size={21}/><span>{label}</span></button>)}</nav><QuickAdd opened={quick} close={()=>setQuick(false)}/><Drawer opened={mobileNav} onClose={()=>setMobileNav(false)} /></>
}
