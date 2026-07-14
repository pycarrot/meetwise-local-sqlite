export function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`;
}

export function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(iso));
}

export function formatClock(iso: string) {
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  );
}
