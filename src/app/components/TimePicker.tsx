interface TimePickerProps { value: string; onChange: (value: string) => void; }
/** Keyboard-editable time field using the platform's locale and 12/24-hour format. */
export function TimePicker({value, onChange}: TimePickerProps) {
 return <input type="time" aria-label="Schedule time" className="tidy-time" value={value} onChange={event => { if (event.target.value) onChange(event.target.value); }} />;
}
