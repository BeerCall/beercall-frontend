export type ActionButton = {
    label: string;
    action_id: string;
    style: "primary" | "secondary" | "danger" | "success";
};

export type SduiPayload = {
    game_id: string;
    turn_of: string;
    instruction_header: string;
    title: string;
    description: string;
    required_sensor: { type: string; [key: string]: any };
    actions: ActionButton[];
};