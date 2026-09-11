package com.codewithmosh.store.products;

import org.springframework.data.domain.Sort;
import org.springframework.data.repository.CrudRepository;

import java.util.List;

public interface CategoryRepository extends CrudRepository<Category, Byte> {
    List<Category> findAll(Sort sort);
}