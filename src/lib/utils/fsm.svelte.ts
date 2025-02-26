export type FSMContext<ContextType> = {
    [key in keyof ContextType]: ContextType[key];
};

export type FSMState<ContextType extends Record<string, any>, StateKeyType> = {
    on?: Record<string, (StateKeyType | ((context: FSMContext<ContextType>, data: any, machine: FSM<ContextType, any>) => StateKeyType | Promise<StateKeyType>))>;
    guard?: (context: FSMContext<ContextType>, machine: FSM<ContextType, any>) => Promise<void | boolean | StateKeyType> | void | boolean | StateKeyType;
    enter?: (context: FSMContext<ContextType>, machine: FSM<ContextType, any>) => Promise<FSMContext<ContextType> | void | StateKeyType> | FSMContext<ContextType> | void | StateKeyType;
    exit?: (context: FSMContext<ContextType>, machine: FSM<ContextType, any>) => Promise<void> | void;
    goto?: StateKeyType;
};

export class FSM<
    ContextType extends Record<string, any>,
    StateType extends Record<string, FSMState<ContextType, keyof StateType>>
> {
    public initialState: keyof StateType;
    public state: keyof StateType = $state('');
    public states: StateType;
    public context: ContextType = $state({} as ContextType);
    private debug: boolean = true;
    private isTransitioning: boolean = false;
    private pendingEvents: Array<{event: string, data?: any, context?: Partial<ContextType>}> = [];

    /**
     * Create a new finite state machine.
     * @param {Object} opts - Options object.
     * @param {Record<string, any>} opts.context - Initial context.
     * @param {Record<string, FSMState<ContextType, keyof StateType>>} opts.states - State machine states.
     * @param {string} opts.initial - Initial state.
     * @param {boolean} opts.debug - Debug mode. Logs internal state changes and function calls.
     * @returns {FSM} - Finite state machine.
     */
    constructor(context: ContextType, states: StateType, initial: keyof StateType, config?: { debug?: boolean; }) {
        this.context = context;
        this.states = states;
        this.initialState = initial;
        this.debug = config?.debug || false;
        this.log('Created with config:', config);
    }

    private log(...message: any[]): void {
        if (this.debug) console.log('[FSM]', ...message, 'Current:', this.state, this.context);
    }

    /**
     * Start the finite state machine.
     * @param {Partial<ContextType>} context - Context to start with.
     * @returns {Promise<void>} - Promise that resolves when the FSM has started.
     */
    async start(context?: Partial<ContextType>): Promise<void> {
        this.log('START:', this.initialState);
        this.state = this.initialState;
        await this.transition(this.initialState, context);
    }

    /**
     * Send an event to the finite state machine.
     * @param {string} event - Event to send.
     * @param {any} data - Data to send with the event to the handler.
     * @param {Partial<ContextType>} context - Context to send with the event.
     * @returns {Promise<void>} - Promise that resolves when the event has been processed.
     */
    async send(event: string, data?: any, context?: Partial<ContextType>): Promise<void> {
        this.log('SEND:', event, 'with data:', data);
        
        // If we're already transitioning, queue this event
        if (this.isTransitioning) {
            this.log('Machine is busy, queueing event:', event);
            this.pendingEvents.push({event, data, context});
            return;
        }
        
        const state = this.states[this.state];
        if (state.on && state.on[event]) {
            try {
                this.isTransitioning = true;
                const handler = state.on[event];
                const newState = typeof handler === 'function' 
                    ? await Promise.resolve(handler(this.context, data, this))
                    : handler;
                await this.transition(newState, context);
            } catch (error) {
                console.error(`Error processing event ${event} in state ${String(this.state)}:`, error);
            } finally {
                this.isTransitioning = false;
                // Process any pending events
                if (this.pendingEvents.length > 0) {
                    const nextEvent = this.pendingEvents.shift()!;
                    await this.send(nextEvent.event, nextEvent.data, nextEvent.context);
                }
            }
        } else {
            console.error(`Event ${event} not found in state ${String(this.state)}`);
        }
    }

    private async transition(newState: keyof StateType, context: Partial<ContextType> = {}): Promise<void> {
        this.context = { ...this.context, ...context };
        this.log(`TRANSITION: "${String(this.state)}" to "${String(newState)}"`);
        
        // Run exit handler on current state if it exists
        if (this.state && this.states[this.state].exit) {
            this.log('EXIT:', this.state);
            try {
                await Promise.resolve(this.states[this.state].exit!(this.context, this));
            } catch (error) {
                console.error(`Error in exit handler for state ${String(this.state)}:`, error);
            }
        }
        
        // run guard if it exists
        if (this.states[newState].guard) {
            this.log('GUARD:', newState);
            try {
                const nextState = await this.states[newState].guard!(this.context, this);
                if (nextState === true) {
                    this.state = newState;
                }
                else if(nextState === false || nextState === undefined) {
                    this.log(`Guard failed for state "${String(newState)}". Staying in "${String(this.state)}".`);
                    return;
                }
                else if(typeof nextState === 'string') {
                    if(!this.states[nextState]) {
                        throw new Error(`State "${nextState}" returned from guard in "${String(newState)}" does not exist.`);
                    }
                    this.log(`Transitioning to "${String(nextState)}" from guard in ${String(this.state)}.`);
                    return this.transition(nextState);
                }
            } catch (error) {
                console.error(`Error in guard for state ${String(newState)}:`, error);
                return;
            }
        } else {
            this.state = newState;
        }
        
        await this.enter();
        
        if(this.states[this.state].goto) {
            await this.goto(this.states[this.state].goto!);
        }
    }

    private async goto(newState: keyof StateType): Promise<void> {
        // don't allow loops
        if (this.state === newState) {
            throw new Error(`Goto loop detected in state ${String(this.state)} to ${String(newState)}`);
        }
        this.log('GOTO:', newState);
        this.state = newState;
        await this.transition(newState);
    }

    private async enter(): Promise<void> {
        if (this.states[this.state].enter) {
            this.log('ENTER:', this.state);
            try {
                const ret = await Promise.resolve(
                    this.states[this.state].enter!(this.context, this)
                );
                this.log('ENTERED:', this.state, ret);
                if (ret) {
                    // If the return value is a valid state key, transition to that state
                    if (typeof ret === 'string' && this.states[ret as keyof StateType]) {
                        this.log(`Transitioning to "${String(ret)}" from enter in ${String(this.state)}.`);
                        return this.transition(ret as keyof StateType);
                    }
                    // Otherwise, treat it as context update
                    this.context = ret as ContextType;
                }
            } catch (error) {
                console.error(`Error in enter handler for state ${String(this.state)}:`, error);
            }
        }
    }
    
    /**
     * Check if the machine is currently processing an event or transition.
     * @returns {boolean} - True if the machine is busy, false otherwise.
     */
    isBusy(): boolean {
        return this.isTransitioning;
    }
    
    /**
     * Get the number of pending events waiting to be processed.
     * @returns {number} - Number of pending events.
     */
    getPendingEventCount(): number {
        return this.pendingEvents.length;
    }
}