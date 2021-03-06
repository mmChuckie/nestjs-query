import { Class, Filter } from '@nestjs-query/core';
import { InputType, Field } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { getMetadataStorage } from '../../metadata';
import { ResolverRelation } from '../../resolvers/relations';
import { createFilterComparisonType } from './field-comparison';
import { UnregisteredObjectType } from '../type.errors';

export type FilterableRelations = Record<string, Class<unknown>>;

function getOrCreateFilterType<T>(
  TClass: Class<T>,
  name: string,
  filterableRelations: FilterableRelations = {},
): Class<Filter<T>> {
  const metadataStorage = getMetadataStorage();
  const existing = metadataStorage.getFilterType<T>(name);
  if (existing) {
    return existing;
  }
  const fields = metadataStorage.getFilterableObjectFields(TClass);
  if (!fields) {
    throw new Error(`No fields found to create GraphQLFilter for ${TClass.name}`);
  }

  @InputType(name)
  class GraphQLFilter {
    @ValidateNested()
    @Field(() => [GraphQLFilter], { nullable: true })
    @Type(() => GraphQLFilter)
    and?: Filter<T>[];

    @ValidateNested()
    @Field(() => [GraphQLFilter], { nullable: true })
    @Type(() => GraphQLFilter)
    or?: Filter<T>[];
  }

  fields.forEach(({ propertyName, target, returnTypeFunc }) => {
    const FC = createFilterComparisonType(target, returnTypeFunc);
    ValidateNested()(GraphQLFilter.prototype, propertyName);
    Field(() => FC, { nullable: true })(GraphQLFilter.prototype, propertyName);
    Type(() => FC)(GraphQLFilter.prototype, propertyName);
  });
  Object.keys(filterableRelations).forEach((field) => {
    const FieldType = filterableRelations[field];
    if (FieldType) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      const FC = getOrCreateFilterType(FieldType, `${name}${getObjectTypeName(FieldType)}Filter`);
      ValidateNested()(GraphQLFilter.prototype, field);
      Field(() => FC, { nullable: true })(GraphQLFilter.prototype, field);
      Type(() => FC)(GraphQLFilter.prototype, field);
    }
  });
  metadataStorage.addFilterType(name, GraphQLFilter as Class<Filter<T>>);
  return GraphQLFilter as Class<Filter<T>>;
}

function getObjectTypeName<DTO>(DTOClass: Class<DTO>): string {
  const objMetadata = getMetadataStorage().getGraphqlObjectMetadata(DTOClass);
  if (!objMetadata) {
    throw new UnregisteredObjectType(DTOClass, 'No fields found to create FilterType.');
  }
  return objMetadata.name;
}

function getFilterableRelations(relations: Record<string, ResolverRelation<unknown>>): FilterableRelations {
  const filterableRelations: FilterableRelations = {};
  Object.keys(relations).forEach((r) => {
    const opts = relations[r];
    if (opts && opts.allowFiltering) {
      filterableRelations[r] = opts.DTO;
    }
  });
  return filterableRelations;
}

export function FilterType<T>(TClass: Class<T>): Class<Filter<T>> {
  const { one = {}, many = {} } = getMetadataStorage().getRelations(TClass);
  const filterableRelations: FilterableRelations = { ...getFilterableRelations(one), ...getFilterableRelations(many) };
  return getOrCreateFilterType(TClass, `${getObjectTypeName(TClass)}Filter`, filterableRelations);
}

export function DeleteFilterType<T>(TClass: Class<T>): Class<Filter<T>> {
  return getOrCreateFilterType(TClass, `${getObjectTypeName(TClass)}DeleteFilter`);
}

export function UpdateFilterType<T>(TClass: Class<T>): Class<Filter<T>> {
  return getOrCreateFilterType(TClass, `${getObjectTypeName(TClass)}UpdateFilter`);
}

export function SubscriptionFilterType<T>(TClass: Class<T>): Class<Filter<T>> {
  return getOrCreateFilterType(TClass, `${getObjectTypeName(TClass)}SubscriptionFilter`);
}

export function AggregateFilterType<T>(TClass: Class<T>): Class<Filter<T>> {
  return getOrCreateFilterType(TClass, `${getObjectTypeName(TClass)}AggregateFilter`);
}
