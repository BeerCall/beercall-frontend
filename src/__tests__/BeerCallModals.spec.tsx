import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './utils/test-utils';
import CreateBeerCallModal from '../components/Modals/CreateBeerCallModal';
import RespondBeerCallModal from '../components/Modals/RespondBeerCallModal';
import ScheduleAperoModal from '../components/Modals/ScheduleAperoModal';
import { api } from '../lib/api';
import { toast } from '../store/useToastStore';
import { useLocationStore } from '../store/useLocationStore';
import type { BeerCall } from '../types/dashboard';

vi.mock('../lib/api', () => ({
    api: {
        post: vi.fn(),
        get: vi.fn(),
    }
}));

// Mock URL.createObjectURL/revokeObjectURL
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
global.URL.revokeObjectURL = vi.fn();

// Mock FileReader and Canvas for processImageForBackend
global.FileReader = class {
    result: string | null = null;
    timer: ReturnType<typeof setTimeout> | null = null;
    onload: ((e: { target: { result: string } }) => void) | null = null;
    onerror: ((e: Error) => void) | null = null;
    readAsDataURL() {
        this.timer = setTimeout(() => {
            this.result = 'data:image/jpeg;base64,fake';
            if (this.onload) this.onload({ target: { result: this.result } });
        }, 10);
    }
    abort() {
        if (this.timer) clearTimeout(this.timer);
    }
} as unknown as typeof FileReader;

global.Image = class {
    onload: (() => void) | null = null;
    width = 100;
    height = 100;
    _src = '';
    set src(val: string) {
        this._src = val;
        setTimeout(() => {
            if (this.onload) this.onload();
        }, 10);
    }
    get src() {
        return this._src;
    }
} as unknown as typeof global.Image;

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toBlob = function(callback: BlobCallback) {
    setTimeout(() => {
        callback(new Blob(['fake-image-content'], { type: 'image/jpeg' }));
    }, 10);
};

// Fix GPS live simulé pour les soumissions nominales (T24).
const grantFix = (lat = 48.8566, lng = 2.3522) => {
    useLocationStore.setState({
        userLocation: { lat, lng }, acquiredAt: 1_000, hasSessionFix: true,
        locationStatus: 'available', isTracking: false, error: null,
    });
};
const clearFix = () => {
    useLocationStore.setState({
        userLocation: null, acquiredAt: null, hasSessionFix: false,
        locationStatus: 'idle', isTracking: false, error: null,
    });
};

describe('BeerCall Modals', () => {
    beforeEach(() => {
        useLocationStore.getState().stopTracking();
        clearFix();
        vi.clearAllMocks();
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it('CreateBeerCallModal: submit with photo and location', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };
        
        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'call-1' } });
        
        grantFix();
        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={null} onClose={onClose} />);
        
        const locationInput = screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        
        expect(submitBtn).toBeDisabled();
        
        await user.type(locationInput, 'Mon super bar');
        expect(submitBtn).not.toBeDisabled();
        
        await user.click(submitBtn);
        
        // Let promises resolve
        await vi.runAllTimersAsync();
        
        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/squads/sq-1/beer-calls/', expect.any(FormData), expect.any(Object));
        });
        const formData = vi.mocked(api.post).mock.calls[0][1] as FormData;
        expect(formData.get('location_name')).toBe('Mon super bar');
        expect(formData.get('latitude')).toBe('48.8566');
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('CreateBeerCallModal: envoie le fix live, pas les coordonnées du marqueur', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        grantFix(48.1, 2.1);
        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'call-live' } });

        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={{ lat: 50, lng: 5 }} scheduledApero={null} onClose={vi.fn()} />);
        await user.type(screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i), 'Bar live');
        await user.click(screen.getByRole('button', { name: /LANCER L'APPEL/i }));
        await vi.runAllTimersAsync();

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const data = vi.mocked(api.post).mock.calls[0][1] as FormData;
        expect(data.get('latitude')).toBe('48.1');
        expect(data.get('longitude')).toBe('2.1');
    });

    it('CreateBeerCallModal: bloque sans fix live, puis un fix rétablit un envoi unique', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'call-after-fix' } });

        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={{ lat: 48.8566, lng: 2.3522 }} scheduledApero={null} onClose={vi.fn()} />);
        const submit = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        await user.type(screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i), 'Bar sans fix');
        expect(submit).toBeDisabled();
        fireEvent.click(submit);
        await vi.runAllTimersAsync();
        expect(api.post).not.toHaveBeenCalled();

        grantFix();
        await waitFor(() => expect(submit).not.toBeDisabled());
        await user.click(submit);
        await vi.runAllTimersAsync();
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    });

    it('CreateBeerCallModal: perdre le fix pendant la préparation annule le POST, un nouveau fix repart une seule fois', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        grantFix();
        const toastSpy = vi.spyOn(toast, 'error');
        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'call-new-fix' } });

        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={{ lat: 48.8566, lng: 2.3522 }} scheduledApero={null} onClose={vi.fn()} />);
        const submit = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        await user.type(screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i), 'Bar perdu');

        fireEvent.click(submit);
        clearFix();
        await vi.runAllTimersAsync();

        expect(api.post).not.toHaveBeenCalled();
        expect(toastSpy).toHaveBeenCalledWith('GPS actuel nécessaire', expect.stringMatching(/position GPS a changé/i));
        expect(submit).toBeDisabled();

        grantFix(47.5, 1.25);
        await waitFor(() => expect(submit).not.toBeDisabled());
        await user.click(submit);
        await vi.runAllTimersAsync();
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const data = vi.mocked(api.post).mock.calls[0][1] as FormData;
        expect(data.get('latitude')).toBe('47.5');
        expect(data.get('longitude')).toBe('1.25');
    });

    it('RespondBeerCallModal: accept and submit photo', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        const beerCall = { id: 'call-1', location_name: 'Le Central', creator_name: 'Creator' };
        const location = { lat: 48.8, lng: 2.3 };
        
        vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true } });
        
        grantFix(48.8, 2.3);
        render(<RespondBeerCallModal isOpen={true} onClose={onClose} beerCall={beerCall} squadId="sq-1" location={location} hasLiveLocation />);
        
        // 1. Click J'y Vais
        const acceptBtn = screen.getByRole('button', { name: /J'y Vais !/i });
        await user.click(acceptBtn);
        
        // 2. Upload photo (file input is hidden, use fireEvent.change)
        // Wait for accepting step to show
        await screen.findByText(/Prouve-le !/i);
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [photoFile] } });
        
        // 3. Submit
        const submitBtn = await screen.findByRole('button', { name: /VALIDATION IA/i });
        expect(submitBtn).not.toBeDisabled();
        await user.click(submitBtn);
        
        await vi.runAllTimersAsync();
        
        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/squads/sq-1/beer-calls/call-1/join/', expect.any(FormData), expect.any(Object));
        });
        const formData = vi.mocked(api.post).mock.calls[0][1] as FormData;
        expect(formData.get('lat')).toBe('48.8');
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('RespondBeerCallModal: sans fix live, J y vais et la validation sont inactifs, Je Passe reste actif', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const beerCall = { id: 'call-1', location_name: 'Le Central', creator_name: 'Creator' };

        render(<RespondBeerCallModal isOpen onClose={vi.fn()} beerCall={beerCall} squadId="sq-1"
                                     location={{ lat: 48.8, lng: 2.3 }} hasLiveLocation={false} />);

        const accept = screen.getByRole('button', { name: /J'y Vais !/i });
        expect(accept).toBeDisabled();
        expect(accept).toHaveAccessibleDescription('Une position GPS actuelle est nécessaire pour accepter.');
        await user.click(accept);
        expect(screen.queryByText(/Prouve-le !/i)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Je Passe/i }));
        expect(await screen.findByText(/L'Esquive/i)).toBeInTheDocument();
    });

    it('RespondBeerCallModal: perdre le fix désactive la validation, un nouveau fix envoie une seule fois ses coordonnées', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const beerCall = { id: 'call-1', location_name: 'Le Central', creator_name: 'Creator' };
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        grantFix();
        vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true } });

        render(<RespondBeerCallModal isOpen onClose={vi.fn()} beerCall={beerCall} squadId="sq-1"
                                     location={{ lat: 50, lng: 5 }} hasLiveLocation />);

        await user.click(screen.getByRole('button', { name: /J'y Vais !/i }));
        await screen.findByText(/Prouve-le !/i);
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(fileInput, { target: { files: [photoFile] } });

        const submit = await screen.findByRole('button', { name: /VALIDATION IA/i });
        expect(submit).not.toBeDisabled();

        clearFix();
        await waitFor(() => expect(submit).toBeDisabled());
        fireEvent.click(submit);
        await vi.runAllTimersAsync();
        expect(api.post).not.toHaveBeenCalled();

        grantFix(47, 1);
        await waitFor(() => expect(submit).not.toBeDisabled());
        await user.click(submit);
        await vi.runAllTimersAsync();

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const data = vi.mocked(api.post).mock.calls[0][1] as FormData;
        expect(data.get('lat')).toBe('47');
        expect(data.get('lon')).toBe('1');
    });

    it('ScheduleAperoModal: submit coordinates', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'sched-1' } });
        
        render(<ScheduleAperoModal isOpen={true} onClose={onClose} squadId="sq-1" coordinates={{ lat: 48.8, lng: 2.3 }} />);
        
        const locInput = screen.getByPlaceholderText(/Ex: Bar Le Central/i);
        const timeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
        const submitBtn = screen.getByRole('button', { name: /PROGRAMMER/i });
        
        await user.type(locInput, 'Chez Roger');
        fireEvent.change(timeInput, { target: { value: '2026-12-31T20:00' } });
        fireEvent.blur(timeInput);
        
        await waitFor(() => {
            expect(submitBtn).not.toBeDisabled();
        });
        await user.click(submitBtn);
        
        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/squads/sq-1/scheduled-beer-calls/', expect.objectContaining({
                location_name: 'Chez Roger',
            }));
        });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('CreateBeerCallModal: submit with photo and location, handles error', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };
        
        vi.mocked(api.post).mockRejectedValueOnce(new Error('Network error'));
        
        grantFix();
        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={null} onClose={onClose} />);
        
        const locationInput = screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        
        await user.type(locationInput, 'Mon super bar');
        await user.click(submitBtn);
        await vi.runAllTimersAsync();
        
        await waitFor(() => {
            expect(submitBtn).not.toBeDisabled();
        });
        expect(onClose).not.toHaveBeenCalled();
        const firstKey = vi.mocked(api.post).mock.calls[0][2]?.headers?.['Idempotency-Key'];
        expect(firstKey).toEqual(expect.any(String));
        vi.mocked(api.post).mockResolvedValueOnce({ data: {} });
        await user.click(submitBtn);
        await vi.runAllTimersAsync();
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
        expect(vi.mocked(api.post).mock.calls[1][2]?.headers?.['Idempotency-Key']).toBe(firstKey);
    });

    it('CreateBeerCallModal: affiche le message sûr sur ImagePreparationError, n appelle pas POST, et réactive le bouton pour réessai', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };

        const toastErrorSpy = vi.spyOn(toast, 'error');
        
        const savedFileReader = global.FileReader;
        let shouldFail = true;
        global.FileReader = class {
            onload: ((e: { target: { result: string } }) => void) | null = null;
            onerror: ((e: unknown) => void) | null = null;
            onabort: ((e: unknown) => void) | null = null;
            readAsDataURL() {
                setTimeout(() => {
                    if (shouldFail) {
                        if (this.onerror) this.onerror(new Error('Corrupt file'));
                    } else {
                        if (this.onload) this.onload({ target: { result: 'data:image/jpeg;base64,ok' } });
                    }
                }, 10);
            }
            abort() {}
        } as unknown as typeof FileReader;

        grantFix();
        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={null} onClose={onClose} />);
        
        const locationInput = screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        
        await user.type(locationInput, 'Mon super bar');
        expect(submitBtn).not.toBeDisabled();
        
        await user.click(submitBtn);
        await vi.runAllTimersAsync();
        
        expect(toastErrorSpy).toHaveBeenCalledWith("Erreur 🚨", "Préparation de la photo impossible. Réessaie avec une autre photo.");
        expect(api.post).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(submitBtn).not.toBeDisabled();
        });

        shouldFail = false;
        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'call-retry' } });
        await user.click(submitBtn);
        await vi.runAllTimersAsync();

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledTimes(1);
        });

        global.FileReader = savedFileReader;
    });

    it('RespondBeerCallModal: accept and submit photo, handles error', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        const beerCall = { id: 'call-1', location_name: 'Le Central', creator_name: 'Creator' };
        
        vi.mocked(api.post).mockRejectedValueOnce(new Error('Rejected'));
        
        grantFix();
        render(<RespondBeerCallModal isOpen={true} onClose={onClose} beerCall={beerCall} squadId="sq-1" location={{ lat: 0, lng: 0 }} hasLiveLocation />);
        
        await user.click(screen.getByRole('button', { name: /J'y Vais !/i }));
        await screen.findByText(/Prouve-le !/i);
        
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(fileInput, { target: { files: [new File(['dummy'], 'photo.png', { type: 'image/png' })] } });
        
        const submitBtn = await screen.findByRole('button', { name: /VALIDATION IA/i });
        await user.click(submitBtn);
        await vi.runAllTimersAsync();
        
        await waitFor(() => {
            expect(submitBtn).not.toBeDisabled();
        });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('ScheduleAperoModal: submit coordinates, handles error', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        vi.mocked(api.post).mockRejectedValueOnce(new Error('Api error'));
        
        render(<ScheduleAperoModal isOpen={true} onClose={onClose} squadId="sq-1" coordinates={{ lat: 48.8, lng: 2.3 }} />);
        
        const locInput = screen.getByPlaceholderText(/Ex: Bar Le Central/i);
        const timeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
        const submitBtn = screen.getByRole('button', { name: /PROGRAMMER/i });
        
        await user.type(locInput, 'Chez Roger');
        fireEvent.change(timeInput, { target: { value: '2026-12-31T20:00' } });
        fireEvent.blur(timeInput);
        
        await waitFor(() => expect(submitBtn).not.toBeDisabled());
        await user.click(submitBtn);
        
        await waitFor(() => {
            expect(submitBtn).not.toBeDisabled();
        });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('CreateBeerCallModal: affiche la succession réelle des libellés (PRÉPARATION -> ENVOI -> EN ATTENTE -> VÉRIFICATION)', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };

        let resolvePost!: (value: { data: { job_id: string } }) => void;
        vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => {
            resolvePost = resolve;
        }));

        let resolveJobGet!: (value: { data: { id: string; status: string } }) => void;
        vi.mocked(api.get).mockImplementationOnce(() => new Promise((resolve) => {
            resolveJobGet = resolve;
        }));

        grantFix();
        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={null} onClose={onClose} />);

        const locationInput = screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        await user.type(locationInput, 'Mon super bar');
        expect(submitBtn).not.toBeDisabled();

        // 1. Déclenchement de la soumission : passe immédiatement en phase "preparing"
        await user.click(submitBtn);
        expect(screen.getByRole('button', { name: 'PRÉPARATION DE LA PHOTO…' })).toBeDisabled();

        // 2. Fin de la préparation photo : FileReader / Canvas se terminent, passe en phase "uploading"
        await vi.advanceTimersByTimeAsync(30);
        expect(await screen.findByRole('button', { name: 'ENVOI DE LA PHOTO…' })).toBeDisabled();

        // 3. Réponse 202 du backend avec job_id : passe en phase de suivi du job ("pending")
        resolvePost({ data: { job_id: 'job-stage-test' } });
        expect(await screen.findByRole('button', { name: 'PHOTO EN ATTENTE DE VÉRIFICATION…' })).toBeDisabled();

        // 4. Job passe en cours de traitement ("running")
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        resolveJobGet({ data: { id: 'job-stage-test', status: 'running' } });
        expect(await screen.findByRole('button', { name: 'VÉRIFICATION DE LA PHOTO…' })).toBeDisabled();
    });

    it('CreateBeerCallModal: deux clics synchrones avant re-render n émettent qu un seul POST (verrou isSubmittingRef)', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };

        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'call-1' } });

        grantFix();
        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={null} onClose={onClose} />);

        const locationInput = screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });

        await user.type(locationInput, 'Mon super bar');
        expect(submitBtn).not.toBeDisabled();

        // Deux clics synchrones consécutifs (par exemple double tap ou appui très rapide)
        fireEvent.click(submitBtn);
        fireEvent.click(submitBtn);

        await vi.runAllTimersAsync();

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledTimes(1);
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('CreateBeerCallModal: apéro programmé avec succès immédiat (sans job) ferme la modale sans double appel', async () => {
        const onClose = vi.fn();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };
        const scheduledApero = { id: 'sched-42', location_name: 'Bar Programmé' } as unknown as BeerCall;

        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'started-1' } });

        grantFix();
        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={scheduledApero} onClose={onClose} />);

        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        expect(submitBtn).not.toBeDisabled();

        // Double appui synchrone
        fireEvent.click(submitBtn);
        fireEvent.click(submitBtn);

        await vi.runAllTimersAsync();

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledTimes(1);
        });
        expect(vi.mocked(api.post)).toHaveBeenCalledWith(
            '/squads/sq-1/beer-calls/sched-42/start/',
            expect.any(FormData),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Content-Type': 'multipart/form-data',
                    'Idempotency-Key': expect.any(String),
                }),
            })
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('CreateBeerCallModal: affiche statut et bouton de récupération à 10s pile, sans appel supplémentaire à 60s sans clic', async () => {
        // Horloge strictement contrôlée : les bornes 9999/10000 ms ne doivent pas
        // dépendre du temps réel consommé par la préparation photo.
        vi.useFakeTimers();
        const onClose = vi.fn();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };

        vi.mocked(api.post).mockResolvedValueOnce({ data: { job_id: 'job-slow-1' } });
        vi.mocked(api.get).mockResolvedValue({ data: { id: 'job-slow-1', status: 'pending' } });

        grantFix();
        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={null} onClose={onClose} />);

        const locationInput = screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        fireEvent.change(locationInput, { target: { value: 'Mon super bar' } });
        fireEvent.click(submitBtn);

        // Trois timers de 10 ms préparent la photo : le job est reçu à t=30 ms.
        await vi.advanceTimersByTimeAsync(30);
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.getByRole('button', { name: /PHOTO EN ATTENTE DE VÉRIFICATION/i })).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledTimes(1);

        // 9999 ms après réception du job : ni message ni bouton de récupération.
        await vi.advanceTimersByTimeAsync(9999);
        expect(screen.queryByText(/La vérification prend plus de temps que prévu\./)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Vérifier le statut' })).not.toBeInTheDocument();

        // La milliseconde suivante atteint exactement 10 s : la notice apparaît.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(screen.getByText(/La vérification prend plus de temps que prévu\./)).toBeInTheDocument();
        const verifyBtn = screen.getByRole('button', { name: 'Vérifier le statut' });
        expect(verifyBtn).not.toBeDisabled();

        // À 60 s sans clic : aucun appel supplémentaire GET ou POST.
        await vi.advanceTimersByTimeAsync(50000);
        expect(api.get).toHaveBeenCalledTimes(1);
        expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('CreateBeerCallModal: clic sur Vérifier le statut relance le même job, désactive 1s pile puis disparaît au terminal', async () => {
        vi.useFakeTimers();
        const onClose = vi.fn();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };

        vi.mocked(api.post).mockResolvedValueOnce({ data: { job_id: 'job-slow-2' } });
        vi.mocked(api.get)
            .mockResolvedValueOnce({ data: { id: 'job-slow-2', status: 'pending' } })
            .mockResolvedValueOnce({ data: { id: 'job-slow-2', status: 'running' } })
            .mockResolvedValueOnce({ data: { id: 'job-slow-2', status: 'succeeded' } });

        grantFix();
        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={null} onClose={onClose} />);

        const locationInput = screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        fireEvent.change(locationInput, { target: { value: 'Mon super bar' } });
        fireEvent.click(submitBtn);

        await vi.advanceTimersByTimeAsync(30);
        await act(async () => {
            await Promise.resolve();
        });
        expect(api.get).toHaveBeenCalledTimes(1);

        // Avancer jusqu'à 10 s pile pour faire apparaître le bouton de récupération
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        const verifyBtn = screen.getByRole('button', { name: 'Vérifier le statut' });
        expect(verifyBtn).not.toBeDisabled();

        // Clic sur "Vérifier le statut" : le cooldown démarre au clic.
        fireEvent.click(verifyBtn);

        expect(verifyBtn).toBeDisabled();

        // 999 ms : toujours désactivé ; 1000 ms pile : réactivé.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(999);
        });
        expect(verifyBtn).toBeDisabled();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(verifyBtn).not.toBeDisabled();

        // Le GET du même job a bien été relancé, sans POST supplémentaire.
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(vi.mocked(api.get)).toHaveBeenLastCalledWith(
            '/squads/sq-1/beer-calls/jobs/job-slow-2',
            expect.any(Object)
        );
        expect(api.post).toHaveBeenCalledTimes(1);

        // Second clic : job passe à succeeded
        fireEvent.click(verifyBtn);
        await act(async () => {
            await Promise.resolve();
        });
        expect(api.get).toHaveBeenCalledTimes(3);

        await act(async () => {
            await vi.runAllTimersAsync();
        });

        // Le statut terminal succeeded ferme la modale et l'indice disparaît
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/La vérification prend plus de temps que prévu\./)).not.toBeInTheDocument();
    });

    it('CreateBeerCallModal: un refus pendant le cooldown annule ses timers et le job suivant repart de zéro', async () => {
        vi.useFakeTimers();
        const onClose = vi.fn();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };

        vi.mocked(api.post)
            .mockResolvedValueOnce({ data: { job_id: 'job-a' } })
            .mockResolvedValueOnce({ data: { job_id: 'job-b' } });
        vi.mocked(api.get)
            .mockResolvedValueOnce({ data: { id: 'job-a', status: 'pending' } })
            .mockResolvedValueOnce({ data: { id: 'job-a', status: 'rejected', reject_reason: 'Pas de boisson' } })
            .mockResolvedValue({ data: { id: 'job-b', status: 'pending' } });

        grantFix();
        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={null} onClose={onClose} />);

        const locationInput = screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        fireEvent.change(locationInput, { target: { value: 'Mon super bar' } });
        fireEvent.click(submitBtn);

        await vi.advanceTimersByTimeAsync(30);
        await act(async () => {
            await Promise.resolve();
        });
        expect(api.get).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        const verifyBtn = screen.getByRole('button', { name: 'Vérifier le statut' });
        fireEvent.click(verifyBtn);
        expect(verifyBtn).toBeDisabled();

        // Le GET relancé refuse le job : terminal, la notice et le cooldown disparaissent.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('button', { name: 'Vérifier le statut' })).not.toBeInTheDocument();
        expect(screen.queryByText(/La vérification prend plus de temps que prévu\./)).not.toBeInTheDocument();

        // Au-delà de l'ancien cooldown : aucun callback périmé ne réactive quoi que ce soit.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(screen.queryByRole('button', { name: 'Vérifier le statut' })).not.toBeInTheDocument();
        expect(api.post).toHaveBeenCalledTimes(1);

        // Nouveau job : sa propre notice ne démarre qu'après 10 s pleines.
        fireEvent.click(screen.getByRole('button', { name: /LANCER L'APPEL/i }));
        await vi.advanceTimersByTimeAsync(30);
        await act(async () => {
            await Promise.resolve();
        });
        expect(api.get).toHaveBeenCalledTimes(3);
        expect(api.post).toHaveBeenCalledTimes(2);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(9999);
        });
        expect(screen.queryByText(/La vérification prend plus de temps que prévu\./)).not.toBeInTheDocument();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(screen.getByRole('button', { name: 'Vérifier le statut' })).not.toBeDisabled();
    });

    it('CreateBeerCallModal: démontage pendant le cooldown annule ses timers et ne déclenche aucun callback résiduel', async () => {
        vi.useFakeTimers();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };

        vi.mocked(api.post).mockResolvedValueOnce({ data: { job_id: 'job-unmount' } });
        vi.mocked(api.get).mockResolvedValue({ data: { id: 'job-unmount', status: 'pending' } });

        grantFix();
        const { unmount } = render(
            <CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={null} onClose={vi.fn()} />
        );

        const locationInput = screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        fireEvent.change(locationInput, { target: { value: 'Mon super bar' } });
        fireEvent.click(submitBtn);

        await vi.advanceTimersByTimeAsync(30);
        await act(async () => {
            await Promise.resolve();
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        const verifyBtn = screen.getByRole('button', { name: 'Vérifier le statut' });

        const timersBeforeCooldown = vi.getTimerCount();
        fireEvent.click(verifyBtn);
        // Le clic arme le cooldown (1 timer supplémentaire)
        expect(vi.getTimerCount()).toBe(timersBeforeCooldown + 1);

        // Au démontage, le cooldown de la modale est annulé immédiatement
        unmount();
        expect(vi.getTimerCount()).toBeLessThan(timersBeforeCooldown + 1);

        // Aucun setState post-démontage ni timer résiduel après l'échéance de 1s
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
    });
});
