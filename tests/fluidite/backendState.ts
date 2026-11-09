import { execFileSync } from 'node:child_process';

export const BACKEND_CONTAINER = process.env.FLUIDITE_BACKEND_CONTAINER || 'beercall-fluidite-night-backend-1';

export interface BadgeSnapshot {
    badge_id: string;
    unlocked_at: string | null;
}

export interface UserSnapshot {
    id: number;
    capsules: number;
    consecutive_joins: number;
    consecutive_declines: number;
    consecutive_piscine: number;
    ia_fraud_count: number;
    badges: BadgeSnapshot[];
}

export function runPython(script: string): string {
    return execFileSync('docker', ['exec', '-i', BACKEND_CONTAINER, 'python', '-'], {
        input: script,
        encoding: 'utf8',
    });
}

export function lastJsonLine(output: string): string {
    const lines = output.trim().split(/\r?\n/).filter(Boolean);
    return lines[lines.length - 1];
}

/** Sérialise une valeur en littéral JSON utilisable dans un script Python. */
function pythonJson(value: unknown): string {
    return JSON.stringify(JSON.stringify(value));
}

export function captureUsers(ids: number[]): UserSnapshot[] {
    const output = runPython(`
import json
from db.database import SessionLocal
from models.user import User
from models.gamification import user_badges
db = SessionLocal()
try:
    result = []
    for user in db.query(User).filter(User.id.in_(${JSON.stringify(ids)})).order_by(User.id).all():
        rows = db.execute(
            user_badges.select()
            .where(user_badges.c.user_id == user.id)
            .order_by(user_badges.c.badge_id)
        ).all()
        result.append({
            'id': user.id,
            'capsules': user.capsules,
            'consecutive_joins': user.consecutive_joins,
            'consecutive_declines': user.consecutive_declines,
            'consecutive_piscine': user.consecutive_piscine,
            'ia_fraud_count': user.ia_fraud_count,
            'badges': [
                {
                    'badge_id': row.badge_id,
                    'unlocked_at': row.unlocked_at.isoformat() if row.unlocked_at else None,
                }
                for row in rows
            ],
        })
    print(json.dumps(result))
finally:
    db.close()
`);
    return JSON.parse(lastJsonLine(output)) as UserSnapshot[];
}

/** Restaure exactement l'état capturé, y compris unlocked_at des badges. */
export function restoreUsers(states: UserSnapshot[]): void {
    if (states.length === 0) return;
    runPython(`
import json
from datetime import datetime
from db.database import SessionLocal
from models.user import User
from models.gamification import user_badges
states = json.loads(${pythonJson(states)})
db = SessionLocal()
try:
    for state in states:
        user = db.get(User, state['id'])
        if not user:
            raise LookupError(f"Joueur à restaurer introuvable: {state['id']}")
        user.capsules = state['capsules']
        user.consecutive_joins = state['consecutive_joins']
        user.consecutive_declines = state['consecutive_declines']
        user.consecutive_piscine = state['consecutive_piscine']
        user.ia_fraud_count = state['ia_fraud_count']
        db.execute(user_badges.delete().where(user_badges.c.user_id == user.id))
        for badge in state['badges']:
            values = {
                'user_id': user.id,
                'badge_id': badge['badge_id'],
                'unlocked_at': datetime.fromisoformat(badge['unlocked_at']) if badge['unlocked_at'] else None,
            }
            db.execute(user_badges.insert().values(**values))
    db.commit()
    print('RESTORED')
finally:
    db.close()
`);
}
