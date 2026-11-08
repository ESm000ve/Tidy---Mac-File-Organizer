import { useTheme } from "next-themes";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect } from "react";
import { Check, ChevronDown, Display, Moon, Sun } from "./icons";
const choices = [{ value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }, { value: "system", label: "Use system setting", icon: Display }];
export function ThemeToggle({ isCompact = false }: {
    isCompact?: boolean;
}) {
    const { theme = "system", setTheme } = useTheme();
    useEffect(() => { if (theme === "light" || theme === "dark" || theme === "system")
        void window.electron?.setTheme(theme); }, [theme]);
    const chosen = choices.find(choice => choice.value === theme) ?? choices[2];
    return <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className={isCompact ? "tidy-icon-button" : "tidy-button"} aria-label={`${chosen.label}. Theme selector, current theme: ${theme}`}><chosen.icon className="w-4 h-4" aria-hidden="true"/>{!isCompact && <>{chosen.label}<ChevronDown className="w-3 h-3" aria-hidden="true"/></>}</button></DropdownMenu.Trigger>
  <DropdownMenu.Portal><DropdownMenu.Content className="tidy-menu z-[80] min-w-[220px]" align="end" sideOffset={4}><DropdownMenu.RadioGroup value={theme} onValueChange={setTheme}>{choices.map(choice => <DropdownMenu.RadioItem key={choice.value} value={choice.value} className="tidy-menu-item"><DropdownMenu.ItemIndicator className="tidy-menu-check"><Check className="w-4 h-4" aria-hidden="true"/></DropdownMenu.ItemIndicator><choice.icon className="w-4 h-4" aria-hidden="true"/>{choice.label}</DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup></DropdownMenu.Content></DropdownMenu.Portal>
 </DropdownMenu.Root>;
}
