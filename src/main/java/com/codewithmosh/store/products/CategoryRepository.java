package com.codewithmosh.store.products;

import org.springframework.data.domain.Sort;
import org.springframework.data.repository.CrudRepository;

import java.util.List;

public interface CategoryRepository extends CrudRepository<Category, Byte> {
    // Fix beyond the course: sorted listing for GET /categories (CategoryController); CrudRepository has no findAll(Sort).
    List<Category> findAll(Sort sort);
}