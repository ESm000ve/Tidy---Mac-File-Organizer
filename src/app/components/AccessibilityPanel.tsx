import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAccessibility, PROFILES } from "./AccessibilityProvider";
import { ToggleControl } from "./controls/ToggleControl";
import { ThemeToggle } from "./ThemeToggle";
import { Settings, X, Display } from "./icons";
import { ApiKeySettings } from "./ApiKeySettings";
function ProfileRow({ profile, enabled, onToggle }: {
    profile: (typeof PROFILES)[number];
    enabled: boolean;
    onToggle: () => void;
}) {
    return <div className="tidy-settings-row">{profile.icon}<div><p>{profile.name}</p><p>{profile.description}</p></div><ToggleControl checked={enabled} onCheckedChange={onToggle} aria-label={profile.name}/></div>;
}
export function AccessibilityPanel({ isCompact = false }: {
    isCompact?: boolean;
}) {
    const { hasProfile, toggleProfile, resetAll, profiles } = useAccessibility();
    const [open, setOpen] = useState(false);
    useEffect(() => { const handler = () => setOpen(true); window.addEventListener("tidy:open-preferences", handler); return () => window.removeEventListener("tidy:open-preferences", handler); }, []);
    const activeCount = profiles.size;
    return <Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Trigger asChild><button type="button" title={"Settings (⌘,)"} className={isCompact ? "tidy-icon-button" : "tidy-button"} aria-label={`Settings${activeCount ? `, ${activeCount} active` : ""}`}><Settings className="w-4 h-4" aria-hidden="true"/>{!isCompact && "Settings"}</button></Dialog.Trigger>
  <Dialog.Portal><Dialog.Overlay className="tidy-dialog-overlay"/><Dialog.Content className="tidy-settings" aria-describedby="settings-description">
   <div className="tidy-settings-header"><div><Dialog.Title>Settings</Dialog.Title><Dialog.Description id="settings-description">Manage AI, appearance, and accessibility.</Dialog.Description></div><Dialog.Close asChild><button type="button" className="tidy-icon-button" aria-label="Close settings"><X className="w-4 h-4" aria-hidden="true"/></button></Dialog.Close></div>
   <div className="tidy-settings-body">
    <ApiKeySettings />
    <section className="tidy-settings-group" aria-labelledby="settings-appearance"><h3 id="settings-appearance">Appearance</h3><div className="tidy-settings-rows"><div className="tidy-settings-row"><Display className="w-5 h-5" aria-hidden="true"/><div><p>App theme</p><p>Use a light or dark theme, or match the system.</p></div><ThemeToggle /></div></div></section>
    <section className="tidy-settings-group" aria-labelledby="settings-accessibility"><h3 id="settings-accessibility">Accessibility</h3><div className="tidy-settings-rows">{PROFILES.filter(p => !p.group).map(profile => <ProfileRow key={profile.id} profile={profile} enabled={hasProfile(profile.id)} onToggle={() => toggleProfile(profile.id)}/>)}</div></section>
    <section className="tidy-settings-group" aria-labelledby="settings-color"><h3 id="settings-color">Color vision</h3><div className="tidy-settings-rows">{PROFILES.filter(p => p.group).map(profile => <ProfileRow key={profile.id} profile={profile} enabled={hasProfile(profile.id)} onToggle={() => toggleProfile(profile.id)}/>)}</div></section>
    <p className="tidy-settings-note">Changes are saved automatically. You can combine accessibility profiles.</p>
   </div>
   <div className="tidy-settings-footer">{activeCount > 0 && <button type="button" className="tidy-button" onClick={resetAll}>Reset profiles</button>}<Dialog.Close asChild><button type="button" className="tidy-button">Done</button></Dialog.Close></div>
  </Dialog.Content></Dialog.Portal>
 </Dialog.Root>;
}
