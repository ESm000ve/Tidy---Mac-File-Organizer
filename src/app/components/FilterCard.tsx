import { ChevronRight, type Icon } from "./icons";
import { ToggleControl } from "./controls/ToggleControl";
interface FilterCardProps {
    label: string;
    count?: string;
    icon: Icon;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    color?: string;
    expanded?: boolean;
    onExpandToggle?: () => void;
}
export function FilterCard({ label, count = "0 types", icon: RuleIcon, enabled, onToggle, expanded, onExpandToggle }: FilterCardProps) {
    const id = `toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;
    return <div className="tidy-rule-header"><button type="button" className="tidy-rule-disclosure" onClick={onExpandToggle} aria-expanded={expanded} aria-controls={expanded ? `${id}-content` : undefined}>
  <RuleIcon className="w-5 h-5" aria-hidden="true"/><div className="flex-1 min-w-0"><h3 id={`${id}-label`}>{label}</h3><p>{count}</p></div><ChevronRight className={`tidy-rule-chevron w-3 h-3 ${expanded ? "rotate-90" : ""}`} aria-hidden="true"/>
 </button><div className="tidy-rule-toggle"><ToggleControl checked={enabled} onCheckedChange={onToggle} aria-labelledby={`${id}-label`}/></div></div>;
}
