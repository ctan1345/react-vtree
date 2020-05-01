import * as React from 'react';
import {Align, FixedSizeList, FixedSizeListProps} from 'react-window';
import {
  CommonNodeComponentProps,
  CommonNodeData,
  CommonNodeRecord,
  CommonUpdateOptions,
  Row,
  TreeProps,
  TreeState,
} from './utils';

export type FixedSizeUpdateOptions = CommonUpdateOptions;
export type FixedSizeNodeData<T> = CommonNodeData<T>;
export type FixedSizeNodeComponentProps<T> = CommonNodeComponentProps<
  FixedSizeNodeData<T>,
  T
>;
export type FixedSizeNodeRecord<T> = CommonNodeRecord<FixedSizeNodeData<T>, T>;

export type FixedSizeTreeProps<T> = TreeProps<FixedSizeNodeData<T>, T> &
  Omit<FixedSizeListProps, 'children' | 'itemCount'> & {
    readonly children: React.ComponentType<FixedSizeNodeComponentProps<T>>;
  };

export type FixedSizeTreeState<T> = TreeState<
  FixedSizeNodeComponentProps<T>,
  FixedSizeNodeRecord<T>,
  FixedSizeNodeData<T>,
  FixedSizeUpdateOptions,
  T
>;

const computeTree = <T extends {}>(
  {
    refreshNodes = false,
    useDefaultOpenness = false,
  }: FixedSizeUpdateOptions = {},
  {treeWalker}: FixedSizeTreeProps<T>,
  {records: prevRecords, recomputeTree}: FixedSizeTreeState<T>,
): Pick<FixedSizeTreeState<T>, 'order' | 'records'> => {
  const order: Array<string | symbol> = [];
  const records = {...prevRecords};
  const iter = treeWalker(refreshNodes);

  if (useDefaultOpenness) {
    for (const id in records) {
      records[id].isOpen = records[id].data.isOpenByDefault;
    }
  }

  let isPreviousOpened = false;

  while (true) {
    const {done, value} = iter.next(isPreviousOpened);

    if (done || !value) {
      break;
    }

    let id: string | symbol;

    if (typeof value === 'string' || typeof value === 'symbol') {
      id = value;

      if (useDefaultOpenness) {
        records[id as string].isOpen =
          records[id as string].data.isOpenByDefault;
      }
    } else {
      ({id} = value);
      const {isOpenByDefault} = value;
      let record = records[id as string];

      if (!record) {
        record = {
          data: value,
          isOpen: isOpenByDefault,
          async toggle(): Promise<void> {
            record.isOpen = !record.isOpen;
            await recomputeTree({refreshNodes: record.isOpen});
          },
          async setIsOpen(isOpen): Promise<void> {
            record.isOpen = isOpen;
            await recomputeTree({refreshNodes: record.isOpen});
          },
        };

        records[id as string] = record;
      } else {
        record.data = value;

        if (useDefaultOpenness) {
          record.isOpen = isOpenByDefault;
        }
      }
    }

    order.push(id);
    isPreviousOpened = records[id as string].isOpen;
  }

  return {
    order,
    records,
  };
};

export default class FixedSizeTree<T> extends React.PureComponent<
  FixedSizeTreeProps<T>,
  FixedSizeTreeState<T>
> {
  public static defaultProps: Partial<FixedSizeTreeProps<{}>> = {
    rowComponent: Row,
  };

  public static getDerivedStateFromProps(
    props: FixedSizeTreeProps<{}>,
    state: FixedSizeTreeState<{}>,
  ): Partial<FixedSizeTreeState<{}>> {
    const {children: component, itemData: treeData, treeWalker} = props;
    const {treeWalker: oldTreeWalker, order} = state;

    return {
      component,
      treeData,
      ...(treeWalker !== oldTreeWalker || !order
        ? computeTree({refreshNodes: true}, props, state)
        : null),
    };
  }

  private readonly list: React.RefObject<FixedSizeList> = React.createRef();

  public constructor(props: FixedSizeTreeProps<T>, context: any) {
    super(props, context);

    this.state = {
      component: props.children,
      recomputeTree: this.recomputeTree.bind(this),
      records: {},
      treeWalker: props.treeWalker,
    };
  }

  public async recomputeTree(options?: FixedSizeUpdateOptions): Promise<void> {
    return new Promise(resolve => {
      this.setState<never>(
        prevState => computeTree(options, this.props, prevState),
        resolve,
      );
    });
  }

  public scrollTo(scrollOffset: number): void {
    this.list.current?.scrollTo(scrollOffset);
  }

  public scrollToItem(id: string | symbol, align?: Align): void {
    this.list.current?.scrollToItem(this.state.order!.indexOf(id) || 0, align);
  }

  public render(): React.ReactNode {
    const {children, treeWalker, rowComponent, ...rest} = this.props;

    return (
      <FixedSizeList
        {...rest}
        itemData={this.state}
        itemCount={this.state.order!.length}
        ref={this.list}
      >
        {rowComponent!}
      </FixedSizeList>
    );
  }
}
