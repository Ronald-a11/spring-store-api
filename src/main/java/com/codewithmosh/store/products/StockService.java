package com.codewithmosh.store.products;

import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@AllArgsConstructor
@Service
public class StockService {
    private final ProductRepository productRepository;

    // The check and the decrement are one UPDATE, so two checkouts can't both take the last units.
    @Transactional
    public void reserve(Product product, int quantity) {
        if (productRepository.decreaseStock(product.getId(), quantity) == 0) {
            var inStock = productRepository.findStockById(product.getId());
            throw new OutOfStockException(product.getName(), inStock == null ? 0 : inStock);
        }
    }

    @Transactional
    public void release(Product product, int quantity) {
        productRepository.increaseStock(product.getId(), quantity);
    }
}
