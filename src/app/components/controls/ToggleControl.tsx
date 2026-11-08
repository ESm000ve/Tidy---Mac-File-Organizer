import * as Switch from "@radix-ui/react-switch";
interface ToggleControlProps {
    id?: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    color?: "green" | "blue" | "purple";
    size?: "sm" | "md";
    "aria-labelledby"?: string;
    "aria-describedby"?: string;
    "aria-label"?: string;
}
/** 40×20 visual track within a keyboard-focusable 44×32 hit target. */
export function ToggleControl({ color: _color, size: _size, ...props }: ToggleControlProps) {
    return <Switch.Root {...props} className="tidy-toggle" data-slot="switch"><span className="tidy-toggle-track"><Switch.Thumb className="tidy-toggle-thumb"/></span></Switch.Root>;
}

