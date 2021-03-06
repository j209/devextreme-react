import { addPrefixToKeys, getNestedValue } from "./helpers";
import { createOptionComponent } from "./nested-option";
import { separateProps } from "./widget-config";

interface INestedOptionDescr {
    name: string;
    defaults: Record<string, any>;
    elementEntries: Array<{
        element: React.ReactElement<any>;
        children: Record<string, INestedOptionDescr>;
    }>;
    isCollectionItem: boolean;
}

interface INestedOptionClass {
    type: {
        IsCollectionItem: boolean;
        OwnerType: any;
        OptionName: string;
        DefaultsProps: Record<string, string>;
    };
    props: object;
}

class OptionsManager {

    private readonly _guards: Record<string, number> = {};
    private readonly _nestedOptions: Record<string, INestedOptionDescr> = {};
    private readonly _optionValueGetter: (name: string) => any;

    private _instance: any;

    private _updatingProps: boolean;

    constructor(optionValueGetter: (name: string) => any) {
        this._optionValueGetter = optionValueGetter;
        this._registerNestedOption = this._registerNestedOption.bind(this);

        this.registerNestedOption = this.registerNestedOption.bind(this);
        this._ensureNestedOption = this._ensureNestedOption.bind(this);
        this.handleOptionChange = this.handleOptionChange.bind(this);
        this.processChangedValues = this.processChangedValues.bind(this);
    }

    public get updatingProps(): boolean {
        return this._updatingProps;
    }

    public setInstance(instance: any) {
        this._instance = instance;
    }

    public handleOptionChange(e: { name: string, fullName: string, value: any }) {
        if (this._updatingProps) {
            return;
        }

        let optionValue;

        const nestedOption = this._nestedOptions[e.name];
        if (nestedOption) {
            const nestedOptionObj = separateProps(
                nestedOption.elementEntries[0].element.props,
                nestedOption.defaults,
                []
            ).options;

            if (e.name === e.fullName) {
                Object.keys(nestedOptionObj).forEach((key) => this.handleOptionChange({
                    name: e.name,
                    fullName: `${e.fullName}.${key}`,
                    value: e.value[key]
                }));

                return;
            }

            if (!nestedOption.isCollectionItem) {
                optionValue = getNestedValue(nestedOptionObj, e.fullName.split(".").slice(1));
            }
        } else {
            optionValue = this._optionValueGetter(e.name);
        }

        if (optionValue === undefined || optionValue === null) {
            return;
        }

        this._setGuard(e.fullName, optionValue);
    }

    public processChangedValues(newProps: Record<string, any>, prevProps: Record<string, any>): void {
        this._updatingProps = false;

        for (const optionName of Object.keys(newProps)) {
            if (newProps[optionName] === prevProps[optionName]) {
                continue;
            }

            if (this._guards[optionName]) {
                window.clearTimeout(this._guards[optionName]);
                delete this._guards[optionName];
            }

            if (!this._updatingProps) {
                this._instance.beginUpdate();
                this._updatingProps = true;
            }
            this._instance.option(optionName, newProps[optionName]);
        }

        if (this._updatingProps) {
            this._updatingProps = false;
            this._instance.endUpdate();
        }
    }

    public getNestedOptionsObjects(): Record<string, any> {
        return this._getNestedOptionsObjects(this._nestedOptions);
    }

    public registerNestedOption(
        component: React.ReactElement<any>,
        owner: any
    ): any {
        return this._registerNestedOption(component, owner, null, null);
    }

    private _getNestedOptionsObjects(optionsCollection: Record<string, INestedOptionDescr>): Record<string, any> {

        const nestedOptions: Record<string, any> = {};

        Object.keys(optionsCollection).forEach((key) => {
            const nestedOption = optionsCollection[key];
            const options = nestedOption.elementEntries.map((e) => {
                const props = separateProps(e.element.props, nestedOption.defaults, []);
                return {
                    ...props.defaults,
                    ...props.options,
                    ...this._getNestedOptionsObjects(e.children)
                };
            });

            nestedOptions[nestedOption.name] = nestedOption.isCollectionItem ? options : options[options.length - 1];
        });

        return nestedOptions;
    }

    private _registerNestedOption(
        element: React.ReactElement<any>,
        owner: any,
        ownerFullName: string|null,
        owningCollection: Record<string, INestedOptionDescr>|null
    ): any {
        const nestedOptionClass = element as any as INestedOptionClass;
        if (
            nestedOptionClass && nestedOptionClass.type &&
            nestedOptionClass.type.OptionName &&
            nestedOptionClass.type.OwnerType && owner instanceof nestedOptionClass.type.OwnerType
        ) {
            const nestedOptionsCollection: Record<string, INestedOptionDescr> = {};
            const optionName = nestedOptionClass.type.OptionName;

            let optionFullName = nestedOptionClass.type.OptionName;
            if (ownerFullName) {
                optionFullName = `${ownerFullName}.${optionName}`;
            }

            const optionComponent = createOptionComponent(
                element,
                {
                    optionName,
                    registerNestedOption: (c: React.ReactElement<any>, o: any) => {
                        return this._registerNestedOption(c, o, optionName, nestedOptionsCollection);
                    },
                    updateFunc: (newProps, prevProps) => {
                        const newOptions = separateProps(newProps, nestedOptionClass.type.DefaultsProps, []).options;
                        this.processChangedValues(
                            addPrefixToKeys(newOptions, optionFullName + "."),
                            addPrefixToKeys(prevProps, optionFullName + ".")
                        );
                    }
                }
            );

            const entry = this._ensureNestedOption(
                optionName,
                owningCollection || this._nestedOptions,
                nestedOptionClass.type.DefaultsProps,
                nestedOptionClass.type.IsCollectionItem
            );

            entry.elementEntries.push({
                element,
                children: nestedOptionsCollection
            });

            return optionComponent;
        }

        return null;
    }

    private _ensureNestedOption(
        name: string,
        optionsCollection: Record<string, INestedOptionDescr>,
        defaults: Record<string, any>,
        isCollectionItem: boolean
    ): INestedOptionDescr {

        if (optionsCollection[name] === null ||
            optionsCollection[name] === undefined
        ) {
            optionsCollection[name] = {
                name,
                defaults,
                elementEntries: [],
                isCollectionItem
            };
        }

        return optionsCollection[name];
    }

    private _setGuard(optionName, optionValue): void {
        if (this._guards[optionName] !== undefined) {
            return;
        }

        const guardId = window.setTimeout(() => {
            this._instance.option(optionName, optionValue);
            window.clearTimeout(guardId);
            delete this._guards[optionName];
        });

        this._guards[optionName] = guardId;
    }
}

export default OptionsManager;
